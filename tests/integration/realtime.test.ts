import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { WebSocket } from 'ws';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { Value } from '@sinclair/typebox/value';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RealtimeFrameSchema, RealtimeTicketSchema, SyncStateSchema, type RealtimeFrame, type SyncState } from '@samokettik/contracts';
import { buildApp } from '../../apps/server/src/app.js';
import { loadBusinessConfig } from '../../apps/server/src/config/business.js';
import { loadEnvironment } from '../../apps/server/src/config/env.js';
import { migrationsPath, projectRoot } from '../../apps/server/src/config/paths.js';
import { createDatabase } from '../../apps/server/src/db/client.js';
import { seedDatabase } from '../../apps/server/src/db/seed-data.js';
import { demoPayments, idempotencyRequests, invoices, localMailbox, mailOutbox, notifications, realtimeTickets, rentals, tripIntervals, tripSimulations, vehicles } from '../../apps/server/src/db/schema.js';
import { runSimulationJobs } from '../../apps/server/src/jobs/transport.js';
import { runReservationJobs } from '../../apps/server/src/jobs/reservations.js';
import { deliverLocalMail } from '../../apps/server/src/jobs/mail.js';

const env = { ...loadEnvironment(), logLevel: 'silent' as const, demoAuthEnabled: true, demoRuToken: 'e'.repeat(64), demoKyToken: 'f'.repeat(64), wsReconcileMs: 60000 };
const config = { ...loadBusinessConfig(), simulationTickMs: 100 };
const testName = `samokettik_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(env.databaseUrl); testUrl.pathname = `/${testName}`;
const admin = new pg.Pool({ connectionString: env.databaseUrl });
const database = createDatabase(testUrl.toString()), databaseB = createDatabase(testUrl.toString());
const appA = buildApp(env, config, database), appB = buildApp(env, config, databaseB);
const vehicleId = '10000000-0000-4000-8000-000000000005', origin = 'http://127.0.0.1:5173';
const sockets = new Set<WebSocket>(), children = new Set<ChildProcess>();
let urlA: string, urlB: string, created = false;
const token = (user: 'a' | 'b') => user === 'a' ? env.demoRuToken : env.demoKyToken;
async function post(base: string, path: string, user: 'a' | 'b' = 'a', body?: object, key = randomUUID()) {
  const response = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token(user)}`, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function restored(base = urlA, user: 'a' | 'b' = 'a'): Promise<SyncState> {
  const response = await fetch(base + '/api/v1/sync', { headers: { authorization: `Bearer ${token(user)}` } });
  expect(response.status).toBe(200); const result: unknown = await response.json();
  if (!Value.Check(SyncStateSchema, result)) throw new Error('Invalid API restoration state'); return result;
}
async function until(check: () => Promise<boolean> | boolean, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await delay(20); }
  throw new Error('Condition timed out');
}
async function connect(base = urlA, user?: 'a' | 'b') {
  const protocols = ['samokettik.v1'];
  if (user) {
    const ticket = await post(base, '/api/v1/realtime/tickets', user);
    expect(ticket.status).toBe(200); if (!Value.Check(RealtimeTicketSchema, ticket.body)) throw new Error('Invalid ticket response');
    protocols.push(`ticket.${ticket.body.ticket}`);
  }
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/realtime', protocols, { origin });
  sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
  const frames: RealtimeFrame[] = [];
  socket.on('message', data => { const frame: unknown = JSON.parse(data.toString()); if (!Value.Check(RealtimeFrameSchema, frame)) throw new Error('Invalid WS snapshot'); frames.push(frame); });
  await until(() => frames.length > 0);
  return { socket, frames };
}
const privateStates = (frames: RealtimeFrame[]) => frames.flatMap(frame => frame.type === 'state_snapshot' ? [frame.state] : []);
function closeSockets() { for (const socket of sockets) socket.terminate(); sockets.clear(); }
async function reserveAndStart(base = urlA) {
  const reserved = await post(base, '/api/v1/reservations', 'a', { vehicleId }); expect(reserved.status).toBe(201);
  const id: string = reserved.body.reservation.id;
  const started = await post(base, `/api/v1/trips/${id}/start`); expect(started.status).toBe(200);
  return id;
}
function launch(entry: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', entry], { cwd: projectRoot, env: { ...process.env, DATABASE_URL: testUrl.toString(), DEMO_AUTH_ENABLED: 'true', DEMO_USER_RU_TOKEN: env.demoRuToken, DEMO_USER_KY_TOKEN: env.demoKyToken, BOOKING_JOB_POLL_MS: '100' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child); child.on('exit', () => children.delete(child)); child.stdout?.on('data', () => {}); child.stderr?.on('data', () => {});
  return child;
}
async function apiProcess() {
  const child = launch('tests/helpers/realtime-api.ts'); let url: string | undefined;
  let text = '';
  child.stdout?.on('data', data => { text += data.toString(); for (const line of text.split('\n')) { try { const result: unknown = JSON.parse(line); if (result && typeof result === 'object' && 'url' in result && typeof result.url === 'string') url = result.url; } catch {} } });
  await until(() => { if (child.exitCode !== null) throw new Error('API process exited before listening'); return Boolean(url); }, 10000);
  if (!url) throw new Error('No API URL'); return { child, url };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise<void>(resolve => child.once('exit', () => resolve())); child.kill('SIGTERM');
  await stopped;
}
beforeAll(async () => {
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(testName)) throw new Error('Unsafe test DB');
  await admin.query(`CREATE DATABASE "${testName}"`); created = true;
  await migrate(database.db, { migrationsFolder: migrationsPath }); await seedDatabase(database, config);
  urlA = await appA.listen({ host: '127.0.0.1', port: 0 }); urlB = await appB.listen({ host: '127.0.0.1', port: 0 });
});
beforeEach(async () => {
  closeSockets(); for (const child of children) await stop(child);
  await database.db.delete(realtimeTickets); await database.db.delete(idempotencyRequests); await database.db.delete(localMailbox); await database.db.delete(mailOutbox); await database.db.delete(demoPayments); await database.db.delete(invoices); await database.db.delete(tripSimulations); await database.db.delete(tripIntervals); await database.db.delete(notifications); await database.db.delete(rentals);
  await database.db.update(vehicles).set({ batteryBp: 10000, batteryRemainder: 0, serviceMode: 'operational', latitudeE7: 428740000, longitudeE7: 746020000 });
});
afterAll(async () => {
  closeSockets(); for (const child of children) await stop(child);
  await Promise.all([appA.close(), appB.close()]);
  if (created) await admin.query(`DROP DATABASE "${testName}" WITH (FORCE)`); await admin.end();
});

describe('persistent simulation, realtime snapshots and local invoice mail', () => {
  it('uses single-use expiring WS tickets, validates Origin and rejects commands over sockets', async () => {
    const response = await post(urlA, '/api/v1/realtime/tickets');
    if (!Value.Check(RealtimeTicketSchema, response.body)) throw new Error('No ticket');
    const ticket = response.body.ticket, protocols = ['samokettik.v1', `ticket.${ticket}`];
    expect((await database.db.select().from(realtimeTickets))[0]?.hash).not.toBe(ticket);
    const rejected = (values: string[], testOrigin = origin) => new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(urlA.replace('http:', 'ws:') + '/api/v1/realtime', values, { origin: testOrigin });
      sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
      socket.once('unexpected-response', (_request, result) => { result.resume(); resolve(result.statusCode ?? 0); socket.terminate(); });
      socket.once('open', () => { socket.terminate(); reject(new Error('Unexpected successful upgrade')); });
    });
    expect(await rejected(protocols, 'https://untrusted.example')).toBe(403);
    const accepted = new WebSocket(urlA.replace('http:', 'ws:') + '/api/v1/realtime', protocols, { origin });
    sockets.add(accepted); accepted.on('error', () => {}); accepted.on('close', () => sockets.delete(accepted));
    await until(() => accepted.readyState === WebSocket.OPEN); expect(accepted.protocol).toBe('samokettik.v1');
    expect(await rejected(protocols)).toBe(401);
    const next = await post(urlA, '/api/v1/realtime/tickets');
    await database.db.update(realtimeTickets).set({ expiresAt: sql`clock_timestamp()-interval '1 second'` });
    expect(await rejected(['samokettik.v1', `ticket.${next.body.ticket}`])).toBe(401);
    const closing = new Promise<number>(resolve => accepted.once('close', code => resolve(code)));
    accepted.send(JSON.stringify({ action: 'finish' })); expect(await closing).toBe(1008);
  });
  it('broadcasts committed state to three clients across two API instances and keeps private data isolated', async () => {
    const publicClient = await connect(), owner = await connect(urlA, 'a'), other = await connect(urlB, 'b');
    const booking = await post(urlA, '/api/v1/reservations', 'a', { vehicleId }); expect(booking.status).toBe(201);
    const id: string = booking.body.reservation.id;
    await until(() => publicClient.frames.some(frame => frame.type === 'fleet_snapshot' && frame.fleet.items.some(item => item.id === vehicleId && item.status === 'reserved')) && privateStates(owner.frames).some(state => state.current.reservation?.id === id) && privateStates(other.frames).some(state => state.fleet.items.some(item => item.id === vehicleId && item.status === 'reserved')));
    expect(JSON.stringify(other.frames)).not.toContain(id); expect(JSON.stringify(publicClient.frames)).not.toContain(id);
    expect((await post(urlA, `/api/v1/trips/${id}/start`)).status).toBe(200);
    await delay(700); await Promise.all([runSimulationJobs(database, config, 50), runSimulationJobs(databaseB, config, 50)]);
    const [moved] = await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    expect(moved?.batteryBp).toBeLessThan(10000); expect(moved?.longitudeE7).not.toBe(746020000);
    await until(() => privateStates(other.frames).some(state => state.fleet.items.some(item => item.id === vehicleId && item.batteryBp < 10000 && item.status === 'in_ride')));
    expect((await post(urlA, `/api/v1/trips/${id}/pause`)).status).toBe(200);
    const [paused] = await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    await delay(200); await runSimulationJobs(database, config, 50);
    const [still] = await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    expect(still?.latitudeE7).toBe(paused?.latitudeE7); expect(still?.longitudeE7).toBe(paused?.longitudeE7);
    expect((await post(urlA, `/api/v1/trips/${id}/resume`)).status).toBe(200);
    expect((await post(urlB, `/api/v1/trips/${id}/finish`)).status).toBe(200);
    await Promise.all([deliverLocalMail(database, 50), deliverLocalMail(databaseB, 50)]);
    await until(() => privateStates(owner.frames).some(state => state.invoices.items.length === 1 && state.mailbox.items.length === 1 && state.notifications.items.some(item => item.code === 'TRIP_FINISHED')));
    expect(await database.db.select().from(invoices)).toHaveLength(1); expect(await database.db.select().from(localMailbox)).toHaveLength(1);
    const notices = await database.db.select().from(notifications); expect(notices.filter(row => row.code === 'TRIP_FINISHED')).toHaveLength(1);
    const synced = await restored(urlB, 'b'); expect(synced.invoices.items).toHaveLength(0); expect(synced.mailbox.items).toHaveLength(0); expect(JSON.stringify(other.frames)).not.toContain(id);
    expect(publicClient.frames.every((frame, index, list) => index === 0 || frame.sequence > list[index - 1]!.sequence)).toBe(true);
  });
  it.each(['riding', 'paused'] as const)('catches up after a delayed tick and finalizes %s once even outside the zone', async mode => {
    const id = await reserveAndStart();
    if (mode === 'paused') expect((await post(urlA, `/api/v1/trips/${id}/pause`)).status).toBe(200);
    await database.db.transaction(async tx => {
      await tx.update(rentals).set({ startedAt: sql`date_trunc('milliseconds',clock_timestamp())-interval '120 seconds'`, reservedAt: sql`clock_timestamp()-interval '121 seconds'`, warnAt: sql`clock_timestamp()+interval '10 minutes'`, expiresAt: sql`clock_timestamp()+interval '13 minutes'` }).where(eq(rentals.id, id));
      if (mode === 'paused') {
        await tx.execute(sql`UPDATE trip_intervals SET started_at=(SELECT started_at FROM rentals WHERE id=${id}), ended_at=(SELECT started_at FROM rentals WHERE id=${id}) WHERE rental_id=${id} AND ordinal=0`);
        await tx.execute(sql`UPDATE trip_intervals SET started_at=(SELECT started_at FROM rentals WHERE id=${id}) WHERE rental_id=${id} AND ordinal=1`);
      } else await tx.update(tripIntervals).set({ startedAt: sql`(SELECT started_at FROM rentals WHERE id=${id})` }).where(eq(tripIntervals.rentalId, id));
      await tx.update(tripSimulations).set({ lastAt: sql`(SELECT started_at FROM rentals WHERE id=${id})`, rideDrainBpPerMinute: 60000, pauseDrainBpPerMinute: 60000, speedMmPerMinute: 0 }).where(eq(tripSimulations.rentalId, id));
      await tx.update(vehicles).set({ batteryBp: 1500, batteryRemainder: 0, longitudeE7: 0, latitudeE7: 0 }).where(eq(vehicles.id, vehicleId));
    });
    await Promise.all([runSimulationJobs(database, config, 50), runSimulationJobs(databaseB, config, 50), post(urlB, `/api/v1/trips/${id}/finish`)]);
    const [row] = await database.db.select().from(rentals); expect(row?.state).toBe('finished'); expect(row?.endReason).toBe('battery_depleted');
    expect(row!.endedAt!.getTime() - row!.startedAt!.getTime()).toBe(1500);
    const [invoice] = await database.db.select().from(invoices); expect(mode === 'riding' ? invoice?.activeMs : invoice?.pausedMs).toBe(1500n); expect(invoice?.totalMinor).toBe(mode === 'riding' ? 800n : 200n);
    expect(await database.db.select().from(notifications)).toHaveLength(1); expect(await database.db.select().from(mailOutbox)).toHaveLength(1);
    await Promise.all([deliverLocalMail(database, 50), deliverLocalMail(databaseB, 50)]);
    expect((await restored()).mailbox.items[0]?.body).toContain('аккумулятор полностью разряжен');
  });
  it('preserves one logical mail across acceptance/ack rollback and concurrent retries', async () => {
    const id = await reserveAndStart(); expect((await post(urlA, `/api/v1/trips/${id}/finish`)).status).toBe(200);
    await database.pool.query("CREATE FUNCTION reject_mail_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.delivered_at IS NOT NULL THEN RAISE EXCEPTION 'test mail ack crash'; END IF; RETURN NEW; END $$");
    await database.pool.query('CREATE TRIGGER reject_mail_ack BEFORE UPDATE ON mail_outbox FOR EACH ROW EXECUTE FUNCTION reject_mail_ack()');
    try { await expect(deliverLocalMail(database, 50)).rejects.toThrow(); expect(await database.db.select().from(localMailbox)).toHaveLength(0); expect((await database.db.select().from(mailOutbox))[0]?.deliveredAt).toBeNull(); }
    finally { await database.pool.query('DROP TRIGGER reject_mail_ack ON mail_outbox'); await database.pool.query('DROP FUNCTION reject_mail_ack()'); }
    await Promise.all([deliverLocalMail(database, 50), deliverLocalMail(databaseB, 50)]); await deliverLocalMail(database, 50);
    expect(await database.db.select().from(localMailbox)).toHaveLength(1); expect((await database.db.select().from(mailOutbox))[0]?.deliveredAt).not.toBeNull();
  });
  it('keeps fractional charge between rentals and rejects a real charge just below 15 percent', async () => {
    const id = await reserveAndStart();
    await database.db.update(tripSimulations).set({ rideDrainBpPerMinute: 1, speedMmPerMinute: 0 }).where(eq(tripSimulations.rentalId, id));
    await delay(20); expect((await post(urlA, `/api/v1/trips/${id}/finish`)).status).toBe(200);
    const before = (await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId)))[0]!;
    expect(before.batteryRemainder).toBeGreaterThan(0);
    const next = await reserveAndStart();
    const after = (await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId)))[0]!;
    expect(after.batteryRemainder).toBe(before.batteryRemainder); expect(after.batteryBp).toBe(before.batteryBp);
    expect((await post(urlA, `/api/v1/trips/${next}/finish`)).status).toBe(200);
    await database.db.update(vehicles).set({ batteryBp: 1500, batteryRemainder: 1 }).where(eq(vehicles.id, vehicleId));
    expect(await post(urlA, '/api/v1/reservations', 'b', { vehicleId })).toMatchObject({ status: 409, body: { code: 'BATTERY_TOO_LOW' } });
    await database.db.update(vehicles).set({ batteryRemainder: 0 }).where(eq(vehicles.id, vehicleId));
    expect((await post(urlA, '/api/v1/reservations', 'b', { vehicleId })).status).toBe(201);
  });
  it('delivers one reservation warning/expiry and restores current state through the API before reconnect', async () => {
    const client = await connect(urlA, 'a'), result = await post(urlA, '/api/v1/reservations', 'a', { vehicleId });
    const id: string = result.body.reservation.id;
    await database.db.update(rentals).set({ reservedAt: sql`clock_timestamp()-interval '13 minutes'`, warnAt: sql`clock_timestamp()-interval '1 minute'`, expiresAt: sql`clock_timestamp()+interval '400 milliseconds'` }).where(eq(rentals.id, id));
    await Promise.all([runReservationJobs(database, config, 50), runReservationJobs(databaseB, config, 50)]);
    await until(() => privateStates(client.frames).some(state => state.notifications.items.some(item => item.code === 'RESERVATION_EXPIRING')));
    client.socket.terminate(); await delay(450);
    await Promise.all([runReservationJobs(database, config, 50), runReservationJobs(databaseB, config, 50)]);
    const state = await restored(urlB); expect(state.current.reservation).toBeNull(); expect(state.notifications.items).toHaveLength(2);
    const reconnected = await connect(urlB, 'a'); expect(privateStates(reconnected.frames).at(-1)?.current.reservation).toBeNull();
    expect(new Set(state.notifications.items.map(item => item.id)).size).toBe(2);
  });
  it('continues while the API process is down, catches up after worker restart and sends one invoice mail', async () => {
    await database.db.update(vehicles).set({ batteryBp: 6000 }).where(eq(vehicles.id, vehicleId));
    const firstApi = await apiProcess(), id = await reserveAndStart(firstApi.url);
    await database.db.update(tripSimulations).set({ rideDrainBpPerMinute: 60000, tickMs: 100 }).where(eq(tripSimulations.rentalId, id));
    const connected = await connect(firstApi.url, 'a'), firstWorker = launch('apps/server/src/entrypoints/worker.ts');
    await until(async () => (await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId)))[0]!.batteryBp < 6000, 10000);
    await stop(firstApi.child); await until(() => connected.socket.readyState === WebSocket.CLOSED);
    const checkpoint = (await database.db.select().from(tripSimulations))[0]!.lastAt.getTime();
    await until(async () => (await database.db.select().from(tripSimulations))[0]!.lastAt.getTime() > checkpoint);
    await stop(firstWorker);
    const startedAt = (await database.db.select().from(rentals))[0]!.startedAt!.getTime();
    await until(() => Date.now() >= startedAt + 6100, 10000);
    const secondWorker = launch('apps/server/src/entrypoints/worker.ts');
    await until(async () => (await database.db.select().from(localMailbox)).length === 1, 10000);
    const secondApi = await apiProcess(), state = await restored(secondApi.url);
    expect(state.current.trip).toBeNull(); expect(state.invoices.items).toHaveLength(1); expect(state.mailbox.items).toHaveLength(1);
    expect(state.notifications.items.filter(item => item.code === 'TRIP_FINISHED')).toHaveLength(1); expect(state.mailbox.items[0]?.body).toContain('аккумулятор полностью разряжен');
    const [rental] = await database.db.select().from(rentals); expect(rental!.endedAt!.getTime() - startedAt).toBe(6000);
    expect(state.invoices.items[0]?.totalMinor).toBe('800');
    const fresh = await connect(secondApi.url, 'a'); expect(privateStates(fresh.frames).at(-1)?.mailbox.items).toHaveLength(1);
    await stop(secondWorker); await deliverLocalMail(database, 50); expect(await database.db.select().from(localMailbox)).toHaveLength(1);
  }, 30000);
});
