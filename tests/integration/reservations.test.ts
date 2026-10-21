import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { and, count, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { ReservationResultSchema, type Reservation } from '@samokettik/contracts';
import { loadEnvironment } from '../../apps/server/src/config/env.js';
import { loadBusinessConfig } from '../../apps/server/src/config/business.js';
import { DEMO_USER_IDS } from '../../apps/server/src/config/demo-identities.js';
import { migrationsPath, projectRoot } from '../../apps/server/src/config/paths.js';
import { createDatabase } from '../../apps/server/src/db/client.js';
import { seedDatabase } from '../../apps/server/src/db/seed-data.js';
import { idempotencyRequests, jobHeartbeats, notifications, rentals, users, vehicles } from '../../apps/server/src/db/schema.js';
import { reserveVehicle } from '../../apps/server/src/modules/reservations/service.js';
import { buildApp } from '../../apps/server/src/app.js';
import { recordReservationHeartbeat, runReservationJobs } from '../../apps/server/src/jobs/reservations.js';
import { recordTransportHeartbeat, runBackgroundJobs } from '../../apps/server/src/jobs/transport.js';

const baseEnv = loadEnvironment();
const config = loadBusinessConfig();
const env = { ...baseEnv, logLevel: 'silent' as const, demoAuthEnabled: true, demoRuToken: 'a'.repeat(64), demoKyToken: 'b'.repeat(64) };
const testDbName = `samokettik_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(env.databaseUrl);
testUrl.pathname = `/${testDbName}`;
const admin = new pg.Pool({ connectionString: env.databaseUrl, connectionTimeoutMillis: 2000 });
const database = createDatabase(testUrl.toString());
const databaseB = createDatabase(testUrl.toString());
const appA = buildApp(env, config, database);
const appB = buildApp(env, config, databaseB);
let urlA: string;
let urlB: string;
let created = false;
const vehicleId = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const token = (user: 'a' | 'b') => user === 'a' ? env.demoRuToken : env.demoKyToken;

async function post(base: string, path: string, user: 'a' | 'b', body?: object, key = randomUUID()) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token(user)}`, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data: unknown = await response.json();
  return { status: response.status, data };
}
async function reserve(user: 'a' | 'b' = 'a', index = 5, key = randomUUID(), base = urlA) {
  return post(base, '/api/v1/reservations', user, { vehicleId: vehicleId(index) }, key);
}
function reservation(result: { data: unknown }): Reservation {
  if (!Value.Check(ReservationResultSchema, result.data)) throw new Error(`Expected reservation response, received ${JSON.stringify(result.data)}`);
  return result.data.reservation;
}
async function until(check: () => Promise<boolean>, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await delay(30); }
  throw new Error('Condition timed out');
}
async function lockWaiters(minimum: number): Promise<void> {
  await until(async () => {
    const result = await database.pool.query<{ count: string }>("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND state = 'active'");
    return Number(result.rows[0]?.count) >= minimum;
  }, 1500);
}
async function backdate(id: string, expired: boolean): Promise<void> {
  await database.db.execute(sql`UPDATE rentals SET reserved_at = clock_timestamp() - interval '13 minutes' - ${expired ? 3 : 0} * interval '1 minute', warn_at = clock_timestamp() - interval '1 minute' - ${expired ? 3 : 0} * interval '1 minute', expires_at = clock_timestamp() + interval '2 minutes' - ${expired ? 3 : 0} * interval '1 minute' WHERE id = ${id}`);
}
function workerProcess(): ChildProcess {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/entrypoints/worker.ts'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: testUrl.toString(), BOOKING_JOB_POLL_MS: '100', BOOKING_WORKER_STALE_MS: '10000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  return child;
}
async function stopWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

beforeAll(async () => {
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(testDbName)) throw new Error('Unsafe test DB');
  await admin.query(`CREATE DATABASE "${testDbName}"`);
  created = true;
  await migrate(database.db, { migrationsFolder: migrationsPath });
  await seedDatabase(database, config);
  urlA = await appA.listen({ host: '127.0.0.1', port: 0 });
  urlB = await appB.listen({ host: '127.0.0.1', port: 0 });
});
beforeEach(async () => {
  await database.db.delete(idempotencyRequests);
  await database.db.delete(notifications);
  await database.db.delete(rentals);
  await database.db.update(vehicles).set({ batteryBp: 10000, serviceMode: 'operational' });
  await database.db.update(vehicles).set({ batteryBp: 1499 }).where(eq(vehicles.id, vehicleId(2)));
  await database.db.update(vehicles).set({ batteryBp: 1500 }).where(eq(vehicles.id, vehicleId(3)));
  await database.db.update(vehicles).set({ serviceMode: 'maintenance' }).where(eq(vehicles.id, vehicleId(4)));
  await recordReservationHeartbeat(database, config);
  await recordTransportHeartbeat(database, config);
});
afterAll(async () => {
  await Promise.all([appA.close(), appB.close()]);
  if (created) await admin.query(`DROP DATABASE "${testDbName}" WITH (FORCE)`);
  await admin.end();
});

describe('reservations over real HTTP and PostgreSQL', () => {
  it('lists 30 vehicles with charge/maintenance availability without private owners', async () => {
    const response = await fetch(`${urlA}/api/v1/vehicles`);
    expect(response.status).toBe(200);
    const text = await response.text();
    const data = JSON.parse(text) as { items: { publicCode: string; status: string; unavailableReason: string | null }[] };
    expect(data.items).toHaveLength(30);
    expect(data.items.find(row => row.publicCode === 'SK-002')).toMatchObject({ status: 'unavailable', unavailableReason: 'BATTERY_TOO_LOW' });
    expect(data.items.find(row => row.publicCode === 'SK-004')).toMatchObject({ status: 'unavailable', unavailableReason: 'MAINTENANCE' });
    expect(text).not.toContain('userId');
    expect(text).not.toContain('@');
  });

  it('two users simultaneously request one vehicle through two API instances: only one succeeds', async () => {
    const blocker = await database.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE', [vehicleId(5)]);
    const requests = [reserve('a', 5, randomUUID(), urlA), reserve('b', 5, randomUUID(), urlB)];
    try { await lockWaiters(2); }
    finally { await blocker.query('ROLLBACK'); blocker.release(); }
    const results = await Promise.all(requests);
    expect(results.map(row => row.status).sort()).toEqual([201, 409]);
    expect(results.find(row => row.status === 409)?.data).toMatchObject({ code: 'VEHICLE_NOT_AVAILABLE' });
    expect(await database.db.select({ count: count() }).from(rentals).where(eq(rentals.state, 'reserved'))).toEqual([{ count: 1 }]);
    const result = results.find(row => row.status === 201);
    if (!result) throw new Error('No successful reservation');
    const dto = reservation(result);
    expect(Date.parse(dto.expiresAt) - Date.parse(dto.reservedAt)).toBe(900000);
    expect(Date.parse(dto.expiresAt) - Date.parse(dto.warnAt)).toBe(180000);
    expect(await fetch(`${urlA}/api/v1/vehicles`).then(response => response.json())).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: vehicleId(5), status: 'reserved' })]) });
  });

  it('same user cannot reserve two vehicles concurrently using different keys', async () => {
    const results = await Promise.all([reserve('a', 5, randomUUID(), urlA), reserve('a', 6, randomUUID(), urlB)]);
    expect(results.map(row => row.status).sort()).toEqual([201, 409]);
    expect(results.find(row => row.status === 409)?.data).toMatchObject({ code: 'ACTIVE_RENTAL_EXISTS' });
  });

  it('twenty distinct users through two PostgreSQL pools have exactly one reservation winner', async () => {
    const contenders = Array.from({ length: 20 }, (_, index) => ({ id: randomUUID(), emailNormalized: `audit-${index}-${randomUUID()}@example.test`, locale: 'ru' }));
    await database.db.insert(users).values(contenders);
    const blocker = await database.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE', [vehicleId(5)]);
    const pending = Promise.allSettled(contenders.map((user, index) => reserveVehicle(index % 2 ? databaseB : database, config, user.id, randomUUID(), vehicleId(5))));
    try {
      // Observe through the already-held connection; both application pools may
      // be full while contenders deliberately wait for this vehicle lock.
      await until(async () => {
        await blocker.query('SELECT pg_stat_clear_snapshot()');
        const result = await blocker.query<{ count: string }>("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND state='active'");
        return Number(result.rows[0]?.count) >= 2;
      }, 1500);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await pending; }
    const settled = await pending;
    expect(settled.every(result => result.status === 'fulfilled')).toBe(true);
    const results = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    expect(results.filter(result => result.status === 201)).toHaveLength(1);
    expect(results.filter(result => result.status === 409)).toHaveLength(19);
    expect(results.filter(result => result.status !== 201).every(result => 'code' in result.body && result.body.code === 'VEHICLE_NOT_AVAILABLE')).toBe(true);
    expect(await database.db.select({ count: count() }).from(rentals).where(eq(rentals.state, 'reserved'))).toEqual([{ count: 1 }]);
  });

  it('concurrent same-key repeats return exactly the stored result across a new API instance', async () => {
    const key = randomUUID();
    const [first, second] = await Promise.all([reserve('a', 5, key, urlA), reserve('a', 5, key, urlB)]);
    expect(first.status).toBe(201);
    expect(second).toEqual(first);
    expect(await database.db.select({ count: count() }).from(rentals)).toEqual([{ count: 1 }]);
    expect(await database.db.select({ count: count() }).from(idempotencyRequests)).toEqual([{ count: 1 }]);
    const fresh = buildApp(env, config, createDatabase(testUrl.toString()));
    try { expect(await reserve('a', 5, key, await fresh.listen({ host: '127.0.0.1', port: 0 }))).toEqual(first); }
    finally { await fresh.close(); }
    expect((await reserve('a', 6, key)).data).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await post(urlA, `/api/v1/reservations/${reservation(first).id}/cancel`, 'a', undefined, key)).data).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('cancellation checks owner, is repeatable with same/new keys, and frees the vehicle', async () => {
    const id = reservation(await reserve()).id;
    const path = `/api/v1/reservations/${id}/cancel`;
    expect((await post(urlB, path, 'b')).status).toBe(404);
    const key = randomUUID();
    const cancelled = await post(urlA, path, 'a', undefined, key);
    expect(cancelled.status).toBe(200);
    expect(reservation(cancelled).state).toBe('cancelled');
    expect(await post(urlB, path, 'a', undefined, key)).toEqual(cancelled);
    expect(await post(urlA, path, 'a')).toEqual(cancelled);
    expect((await reserve('b')).status).toBe(201);
  });

  it('replays a rejection rather than creating a booking after availability changes', async () => {
    const original = reservation(await reserve());
    const key = randomUUID();
    expect((await reserve('b', 5, key)).status).toBe(409);
    await post(urlA, `/api/v1/reservations/${original.id}/cancel`, 'a');
    expect((await reserve('b', 5, key)).data).toMatchObject({ code: 'VEHICLE_NOT_AVAILABLE' });
    expect((await reserve('b', 5, randomUUID())).status).toBe(201);
  });

  it('validates identity, UUID/key, unknown fields, low charge and maintenance', async () => {
    expect((await fetch(`${urlA}/api/v1/rentals/current`)).status).toBe(401);
    expect((await fetch(`${urlA}/api/v1/rentals/current`, { headers: { authorization: 'Bearer fake-user-id' } })).status).toBe(401);
    const missingKey = await fetch(`${urlA}/api/v1/reservations`, { method: 'POST', headers: { authorization: `Bearer ${token('a')}`, 'content-type': 'application/json' }, body: JSON.stringify({ vehicleId: vehicleId(5) }) });
    expect(missingKey.status).toBe(400);
    expect((await post(urlA, '/api/v1/reservations', 'a', { vehicleId: vehicleId(5), userId: DEMO_USER_IDS.ky, expiresAt: '2099-01-01' })).status).toBe(400);
    expect((await post(urlA, '/api/v1/reservations', 'a', { vehicleId: 'invalid' })).status).toBe(400);
    expect((await fetch(`${urlA}/api/v1/reservations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid' })).status).toBe(400);
    expect((await reserve('a', 2)).data).toMatchObject({ code: 'BATTERY_TOO_LOW' });
    expect((await reserve('a', 4)).data).toMatchObject({ code: 'VEHICLE_UNAVAILABLE' });
    expect((await reserve('a', 3)).status).toBe(201);
  });

  it('disabled demo auth does not allow arbitrary identities or act as production login', async () => {
    const disabled = buildApp({ ...env, demoAuthEnabled: false }, config, createDatabase(testUrl.toString()));
    try {
      const response = await disabled.inject({ url: '/api/v1/rentals/current', headers: { authorization: `Bearer ${token('a')}` } });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'AUTH_NOT_CONFIGURED' });
    } finally { await disabled.close(); }
  });

  it('cleans an expired foreign reservation without a worker before allowing a new owner', async () => {
    const old = reservation(await reserve());
    await backdate(old.id, true);
    expect((await reserve('b')).status).toBe(201);
    const [row] = await database.db.select().from(rentals).where(eq(rentals.id, old.id));
    expect(row?.state).toBe('expired');
    expect(row?.endedAt).toEqual(row?.expiresAt);
    expect(await database.db.select({ count: count() }).from(notifications)).toEqual([{ count: 1 }]);
  });

  it('two workers produce one warning and expose it only to the owner', async () => {
    const old = reservation(await reserve());
    await backdate(old.id, false);
    await Promise.all([runReservationJobs(database, config, 50), runReservationJobs(databaseB, config, 50)]);
    expect(await database.db.select({ count: count() }).from(notifications)).toEqual([{ count: 1 }]);
    const own = await fetch(`${urlA}/api/v1/notifications`, { headers: { authorization: `Bearer ${token('a')}` } }).then(response => response.json());
    expect(own).toMatchObject({ items: [{ rentalId: old.id, code: 'RESERVATION_EXPIRING' }] });
    expect(await fetch(`${urlB}/api/v1/notifications`, { headers: { authorization: `Bearer ${token('b')}` } }).then(response => response.json())).toEqual({ items: [] });
  });

  it('expiry/cancel race closes once with no stale warning after downtime', async () => {
    const old = reservation(await reserve());
    await backdate(old.id, true);
    const [cancel] = await Promise.all([post(urlA, `/api/v1/reservations/${old.id}/cancel`, 'a'), runReservationJobs(databaseB, config, 50)]);
    expect(cancel.status).toBe(409);
    expect(cancel.data).toMatchObject({ code: 'RESERVATION_EXPIRED' });
    expect(await database.db.select({ code: notifications.code }).from(notifications)).toEqual([{ code: 'RESERVATION_EXPIRED' }]);
    expect(await fetch(`${urlA}/api/v1/rentals/current`, { headers: { authorization: `Bearer ${token('a')}` } }).then(response => response.json())).toMatchObject({ reservation: null });
  });

  it('rechecks time after waiting for the vehicle lock at the deadline', async () => {
    const old = reservation(await reserve());
    await database.db.execute(sql`UPDATE rentals SET reserved_at=clock_timestamp()-interval '14 minutes', warn_at=clock_timestamp()-interval '1 minute', expires_at=clock_timestamp()+interval '400 milliseconds' WHERE id=${old.id}`);
    const blocker = await database.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE', [vehicleId(5)]);
    const request = post(urlA, `/api/v1/reservations/${old.id}/cancel`, 'a');
    try { await lockWaiters(1); await delay(500); }
    finally { await blocker.query('ROLLBACK'); blocker.release(); }
    expect((await request).data).toMatchObject({ code: 'RESERVATION_EXPIRED' });
  });

  it('DB constraints protect uniqueness, terminal states and notification ownership independently of JS', async () => {
    const old = reservation(await reserve());
    const [row] = await database.db.select().from(rentals).where(eq(rentals.id, old.id));
    if (!row) throw new Error('Missing fixture');
    const duplicate = { userId: DEMO_USER_IDS.ky, vehicleId: row.vehicleId, reservedAt: row.reservedAt, warnAt: row.warnAt, expiresAt: row.expiresAt, minimumBatteryBp: 1500 };
    await expect(database.db.insert(rentals).values(duplicate)).rejects.toThrow();
    await expect(database.db.insert(rentals).values({ ...duplicate, userId: DEMO_USER_IDS.ru, vehicleId: vehicleId(6) })).rejects.toThrow();
    await expect(database.db.update(rentals).set({ state: 'expired' }).where(eq(rentals.id, old.id))).rejects.toThrow();
    await expect(database.db.insert(notifications).values({ userId: DEMO_USER_IDS.ky, rentalId: old.id, code: 'RESERVATION_EXPIRING', expiresAt: row.expiresAt, createdAt: new Date() })).rejects.toThrow();
  });

  it('cancels a reservation when its charge drops; missing worker fails readiness', async () => {
    const old = reservation(await reserve());
    await database.db.update(vehicles).set({ batteryBp: 1499 }).where(eq(vehicles.id, old.vehicleId));
    await runReservationJobs(database, config, 50);
    const [row] = await database.db.select().from(rentals).where(eq(rentals.id, old.id));
    expect(row).toMatchObject({ state: 'cancelled', endReason: 'battery_too_low' });
    await database.db.delete(jobHeartbeats);
    expect((await fetch(`${urlA}/health/ready`)).status).toBe(503);
    await runBackgroundJobs(database, config, 50);
    expect((await fetch(`${urlA}/health/ready`)).status).toBe(200);
  });

  it('real worker processes warn without a browser and recover after worker/API restart', async () => {
    const fastConfig = { ...config, reservationDurationSeconds: 4, reservationWarningBeforeSeconds: 2 };
    const fastApp = buildApp(env, fastConfig, createDatabase(testUrl.toString()));
    let firstWorker: ChildProcess | undefined;
    let secondWorker: ChildProcess | undefined;
    let fastClosed = false;
    try {
      const key = randomUUID();
      const initial = await reserve('a', 5, key, await fastApp.listen({ host: '127.0.0.1', port: 0 }));
      const old = reservation(initial);
      firstWorker = workerProcess();
      await until(async () => (await database.db.select().from(notifications).where(eq(notifications.code, 'RESERVATION_EXPIRING'))).length === 1, 4000);
      await stopWorker(firstWorker);
      await fastApp.close(); fastClosed = true;
      await until(async () => (await database.db.select().from(rentals).where(and(eq(rentals.id, old.id), sql`expires_at <= clock_timestamp()`))).length === 1, 4000);
      secondWorker = workerProcess();
      await until(async () => (await database.db.select().from(rentals).where(and(eq(rentals.id, old.id), eq(rentals.state, 'expired')))).length === 1, 3000);
      await stopWorker(secondWorker);
      const fresh = buildApp(env, config, createDatabase(testUrl.toString()));
      try {
        const base = await fresh.listen({ host: '127.0.0.1', port: 0 });
        expect(await reserve('a', 5, key, base)).toEqual(initial);
        expect(await fetch(`${base}/api/v1/rentals/current`, { headers: { authorization: `Bearer ${token('a')}` } }).then(response => response.json())).toMatchObject({ reservation: null });
      } finally { await fresh.close(); }
      expect(await database.db.select({ code: notifications.code }).from(notifications).orderBy(notifications.createdAt)).toEqual([{ code: 'RESERVATION_EXPIRING' }, { code: 'RESERVATION_EXPIRED' }]);
    } finally {
      if (firstWorker) await stopWorker(firstWorker);
      if (secondWorker) await stopWorker(secondWorker);
      if (!fastClosed) await fastApp.close();
    }
  });
});
