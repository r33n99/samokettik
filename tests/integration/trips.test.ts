import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq, sql } from 'drizzle-orm';
import { Value } from '@sinclair/typebox/value';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TripResultSchema, PaymentResultSchema, type ServiceZone } from '@samokettik/contracts';
import { buildApp } from '../../apps/server/src/app.js';
import { loadBusinessConfig } from '../../apps/server/src/config/business.js';
import { loadEnvironment } from '../../apps/server/src/config/env.js';
import { DEMO_USER_IDS } from '../../apps/server/src/config/demo-identities.js';
import { migrationsPath } from '../../apps/server/src/config/paths.js';
import { createDatabase } from '../../apps/server/src/db/client.js';
import { seedDatabase } from '../../apps/server/src/db/seed-data.js';
import { redistributeDemoVehicles } from '../../apps/server/src/db/redistribute-data.js';
import { demoPayments, idempotencyRequests, invoices, localMailbox, mailOutbox, notifications, rentals, tripIntervals, tripSimulations, vehicles } from '../../apps/server/src/db/schema.js';
import { runReservationJobs } from '../../apps/server/src/jobs/reservations.js';

const baseEnv = loadEnvironment();
const env = { ...baseEnv, logLevel: 'silent' as const, demoAuthEnabled: true, demoRuToken: 'c'.repeat(64), demoKyToken: 'd'.repeat(64) };
const zone: ServiceZone = { version: 'integration-square-v1', source: 'synthetic integration fixture', retrievedAt: 'test', attribution: 'test fixture', geometry: { type: 'Polygon', coordinates: [[[74.5, 42.8], [74.7, 42.8], [74.7, 43], [74.5, 43], [74.5, 42.8]]] } };
const config = { ...loadBusinessConfig(), serviceZone: zone, simulationSpeedMetersPerMinute: 0 };
const testName = `samokettik_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: env.databaseUrl, connectionTimeoutMillis: 2000 });
const testUrl = new URL(env.databaseUrl); testUrl.pathname = `/${testName}`;
const database = createDatabase(testUrl.toString());
const appA = buildApp(env, config, database);
const appB = buildApp(env, config, createDatabase(testUrl.toString()));
const vehicleId = '10000000-0000-4000-8000-000000000005';
let urlA: string, urlB: string, created = false;
type User = 'a' | 'b';
async function post(path: string, user: User = 'a', key = randomUUID(), body?: object, base = urlA) {
  const response = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${user === 'a' ? env.demoRuToken : env.demoKyToken}`, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data: unknown = await response.json();
  return { status: response.status, data };
}
async function get(path: string, user: User = 'a', base = urlA) {
  const response = await fetch(base + path, { headers: { authorization: `Bearer ${user === 'a' ? env.demoRuToken : env.demoKyToken}` } });
  return { status: response.status, data: await response.json() as unknown };
}
function trip(result: { status: number; data: unknown }) {
  expect(result.status).toBe(200);
  if (!Value.Check(TripResultSchema, result.data)) throw new Error(`Invalid trip result: ${JSON.stringify(result.data)}`);
  return result.data;
}
async function reserved() {
  const result = await post('/api/v1/reservations', 'a', randomUUID(), { vehicleId });
  expect(result.status).toBe(201);
  const [row] = await database.db.select().from(rentals).where(and(eq(rentals.vehicleId, vehicleId), eq(rentals.state, 'reserved')));
  if (!row) throw new Error('Missing reservation fixture');
  return row.id;
}
async function started() {
  const id = await reserved();
  trip(await post(`/api/v1/trips/${id}/start`));
  return id;
}
async function raceOnOwner<T>(requests: () => Promise<T>[]): Promise<T[]> {
  const blocker = await database.pool.connect();
  await blocker.query('BEGIN');
  await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [DEMO_USER_IDS.ru]);
  const pending = requests();
  try {
    const deadline = Date.now() + 2000;
    let waiters = 0;
    while (Date.now() < deadline) {
      const result = await database.pool.query<{ count: string }>("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock'");
      waiters = Number(result.rows[0]?.count);
      if (waiters >= 2) break;
      await delay(10);
    }
    expect(waiters).toBeGreaterThanOrEqual(2);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  return Promise.all(pending);
}
// Only the isolated test DB is modified. No client timestamp input is accepted.
async function timeline(id: string, closed: { mode: 'riding' | 'paused'; ms: number }[], openMode: 'riding' | 'paused') {
  const result = await database.pool.query<{ ms: string }>('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms');
  const start = Number(result.rows[0]?.ms) - closed.reduce((sum, interval) => sum + interval.ms, 0) - 1000;
  await database.db.transaction(async tx => {
    await tx.update(rentals).set({ state: openMode, startedAt: new Date(start), reservedAt: new Date(start - 1000), warnAt: new Date(start + 720000), expiresAt: new Date(start + 900000) }).where(eq(rentals.id, id));
    await tx.delete(tripIntervals).where(eq(tripIntervals.rentalId, id));
    let cursor = start;
    for (const [ordinal, interval] of closed.entries()) {
      await tx.insert(tripIntervals).values({ rentalId: id, ordinal, mode: interval.mode, startedAt: new Date(cursor), endedAt: new Date(cursor + interval.ms) });
      cursor += interval.ms;
    }
    await tx.insert(tripIntervals).values({ rentalId: id, ordinal: closed.length, mode: openMode, startedAt: new Date(cursor) });
  });
}
beforeAll(async () => {
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(testName)) throw new Error('Unsafe test DB');
  await admin.query(`CREATE DATABASE "${testName}"`); created = true;
  await migrate(database.db, { migrationsFolder: migrationsPath });
  await seedDatabase(database, config);
  urlA = await appA.listen({ host: '127.0.0.1', port: 0 });
  urlB = await appB.listen({ host: '127.0.0.1', port: 0 });
});
beforeEach(async () => {
  await database.db.delete(idempotencyRequests);
  await database.db.delete(demoPayments);
  await database.db.delete(localMailbox);
  await database.db.delete(mailOutbox);
  await database.db.delete(invoices);
  await database.db.delete(tripSimulations);
  await database.db.delete(tripIntervals);
  await database.db.delete(notifications);
  await database.db.delete(rentals);
  await database.db.update(vehicles).set({ batteryBp: 10000, batteryRemainder: 0, serviceMode: 'operational', latitudeE7: 428740000, longitudeE7: 746020000 });
});
afterAll(async () => {
  await Promise.all([appA.close(), appB.close()]);
  if (created) await admin.query(`DROP DATABASE "${testName}" WITH (FORCE)`);
  await admin.end();
});

describe('trip lifecycle over HTTP and PostgreSQL', () => {
  it.each(['reserved', 'riding', 'paused'] as const)('redistributes only idle demo vehicles, preserving %s and repeated runs', async mode => {
    const id = await reserved();
    if (mode !== 'reserved') trip(await post(`/api/v1/trips/${id}/start`));
    if (mode === 'paused') trip(await post(`/api/v1/trips/${id}/pause`));
    const [before] = await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    expect(await redistributeDemoVehicles(database, config)).toEqual({ moved: 29, skippedActive: 1, missing: 0 });
    const [after] = await database.db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    expect(after).toEqual(before);
    const [idle] = await database.db.select().from(vehicles).where(eq(vehicles.publicCode, 'SK-006'));
    expect(idle).toMatchObject({ ...config.seedLocations[5], batteryBp: 10000, serviceMode: 'operational' });
    expect(await redistributeDemoVehicles(database, config)).toEqual({ moved: 0, skippedActive: 1, missing: 0 });
    expect((await database.db.select().from(rentals).where(eq(rentals.id, id)))[0]?.state).toBe(mode);
  });
  it('starts, pauses, resumes and finishes with contiguous server-time intervals', async () => {
    const id = await reserved(), key = randomUUID();
    const first = await post(`/api/v1/trips/${id}/start`, 'a', key);
    expect(trip(first).trip.state).toBe('riding');
    expect(await post(`/api/v1/trips/${id}/start`, 'a', key)).toEqual(first);
    expect((await post(`/api/v1/trips/${id}/start`)).status).toBe(409);
    await delay(10);
    expect(trip(await post(`/api/v1/trips/${id}/pause`)).trip.state).toBe('paused');
    expect((await post(`/api/v1/trips/${id}/pause`)).status).toBe(409);
    await delay(10);
    expect(trip(await post(`/api/v1/trips/${id}/resume`)).trip.state).toBe('riding');
    const done = trip(await post(`/api/v1/trips/${id}/finish`));
    expect(done.trip.state).toBe('finished');
    expect(done.invoice).toMatchObject({ status: 'unpaid', totalMinor: '1000', activeMinutes: '1', pausedMinutes: '1' });
    const rows = await database.db.select().from(tripIntervals).orderBy(tripIntervals.ordinal);
    expect(rows.map(row => row.mode)).toEqual(['riding', 'paused', 'riding']);
    expect(rows.every(row => row.endedAt !== null)).toBe(true);
    expect(rows[0]?.endedAt).toEqual(rows[1]?.startedAt);
    expect(rows[1]?.endedAt).toEqual(rows[2]?.startedAt);
    expect(Number(done.trip.activeMilliseconds) + Number(done.trip.pausedMilliseconds)).toBe(Date.parse(done.trip.endedAt ?? '') - Date.parse(done.trip.startedAt));
    expect(await get('/api/v1/rentals/current')).toMatchObject({ data: { reservation: null, trip: null } });
  });
  it('charges aggregate active minutes separately from fragmented pauses', async () => {
    const id = await started();
    await timeline(id, [{ mode: 'riding', ms: 30000 }, { mode: 'paused', ms: 10000 }, { mode: 'riding', ms: 30000 }, { mode: 'paused', ms: 10000 }], 'riding');
    const done = trip(await post(`/api/v1/trips/${id}/finish`));
    expect(done.invoice).toMatchObject({ activeMinutes: '2', pausedMinutes: '1', pausedMilliseconds: '20000', totalMinor: '1800' });
  });
  it('finishes directly from paused and stops both clocks at the final deadline', async () => {
    const id = await started();
    await timeline(id, [{ mode: 'riding', ms: 60000 }], 'paused');
    const done = trip(await post(`/api/v1/trips/${id}/finish`));
    expect(done.invoice).toMatchObject({ activeMilliseconds: '60000', activeMinutes: '1', pausedMinutes: '1', totalMinor: '1000' });
    await delay(20);
    expect(trip(await get(`/api/v1/trips/${id}`))).toEqual(done);
  });
  it('rejects finish outside using trusted DB GPS, then accepts the polygon edge with a new key', async () => {
    const id = await started(), rejectedKey = randomUUID();
    await database.db.update(vehicles).set({ longitudeE7: 747000001, latitudeE7: 429000000 }).where(eq(vehicles.id, vehicleId));
    expect(await post(`/api/v1/trips/${id}/finish`, 'a', randomUUID(), { latitude: 42.874, longitude: 74.602 })).toMatchObject({ status: 400 });
    expect(await post(`/api/v1/trips/${id}/finish`, 'a', rejectedKey)).toMatchObject({ status: 409, data: { code: 'OUTSIDE_SERVICE_ZONE' } });
    expect(await database.db.select().from(invoices)).toHaveLength(0);
    expect((await database.db.select().from(rentals))[0]).toMatchObject({ state: 'riding', endedAt: null });
    expect((await database.db.select().from(tripIntervals))[0]?.endedAt).toBeNull();
    await database.db.update(vehicles).set({ longitudeE7: 747000000 }).where(eq(vehicles.id, vehicleId));
    expect((await post(`/api/v1/trips/${id}/finish`, 'a', rejectedKey)).status).toBe(409);
    expect(trip(await post(`/api/v1/trips/${id}/finish`)).trip.state).toBe('finished');
  });
  it('does not expose another owner and rejects forged prices, times and invalid transitions', async () => {
    const id = await reserved();
    expect((await post(`/api/v1/trips/${id}/start`, 'b')).status).toBe(404);
    expect((await post(`/api/v1/trips/${id}/finish`)).status).toBe(409);
    expect((await post(`/api/v1/trips/${id}/start`, 'a', randomUUID(), { startedAt: '2020-01-01', totalMinor: '0' })).status).toBe(400);
    trip(await post(`/api/v1/trips/${id}/start`));
    expect((await get(`/api/v1/trips/${id}`, 'b')).status).toBe(404);
    expect((await post(`/api/v1/trips/${id}/resume`)).status).toBe(409);
    expect((await post(`/api/v1/reservations/${id}/cancel`)).status).toBe(409);
  });
  it('rechecks charge and expires an unused reservation before start', async () => {
    const id = await reserved();
    await database.db.update(vehicles).set({ batteryBp: 1499 }).where(eq(vehicles.id, vehicleId));
    expect((await post(`/api/v1/trips/${id}/start`)).status).toBe(409);
    expect((await database.db.select().from(rentals))[0]?.state).toBe('cancelled');
    await database.db.update(vehicles).set({ batteryBp: 10000 }).where(eq(vehicles.id, vehicleId));
    const next = await reserved();
    await database.db.update(rentals).set({ reservedAt: sql`clock_timestamp()-interval '16 minutes'`, warnAt: sql`clock_timestamp()-interval '4 minutes'`, expiresAt: sql`clock_timestamp()-interval '1 minute'` }).where(eq(rentals.id, next));
    expect(await post(`/api/v1/trips/${next}/start`)).toMatchObject({ status: 409, data: { code: 'RESERVATION_EXPIRED' } });
    expect((await database.db.select().from(rentals).where(eq(rentals.id, next)))[0]?.state).toBe('expired');
  });
  it('keeps riding and paused vehicles occupied even after the old reservation deadline', async () => {
    const id = await started();
    await timeline(id, [{ mode: 'riding', ms: 1000000 }], 'paused');
    await runReservationJobs(database, config, 50);
    expect((await database.db.select().from(rentals))[0]?.state).toBe('paused');
    expect(await post('/api/v1/reservations', 'b', randomUUID(), { vehicleId }, urlB)).toMatchObject({ status: 409, data: { code: 'VEHICLE_NOT_AVAILABLE' } });
    expect(await post('/api/v1/reservations', 'a', randomUUID(), { vehicleId: '10000000-0000-4000-8000-000000000006' })).toMatchObject({ status: 409, data: { code: 'ACTIVE_RENTAL_EXISTS' } });
    expect(await get('/api/v1/vehicles')).toMatchObject({ data: { items: expect.arrayContaining([expect.objectContaining({ id: vehicleId, status: 'in_ride' })]) } });
    const [row] = await database.db.select().from(rentals);
    if (!row) throw new Error('No fixture');
    await expect(database.db.insert(rentals).values({ userId: DEMO_USER_IDS.ky, vehicleId, reservedAt: new Date(), warnAt: new Date(Date.now() + 720000), expiresAt: new Date(Date.now() + 900000), minimumBatteryBp: 1500 })).rejects.toThrow();
  });
  it('refuses start outside the zone and rechecks maintenance after booking', async () => {
    const id = await reserved();
    await database.db.update(vehicles).set({ longitudeE7: 747000001 }).where(eq(vehicles.id, vehicleId));
    expect(await post(`/api/v1/trips/${id}/start`)).toMatchObject({ status: 409, data: { code: 'OUTSIDE_SERVICE_ZONE' } });
    expect((await database.db.select().from(rentals))[0]?.state).toBe('reserved');
    await database.db.update(vehicles).set({ longitudeE7: 746020000, serviceMode: 'maintenance' }).where(eq(vehicles.id, vehicleId));
    expect(await post(`/api/v1/trips/${id}/start`)).toMatchObject({ status: 409, data: { code: 'VEHICLE_UNAVAILABLE' } });
    expect((await database.db.select().from(rentals))[0]).toMatchObject({ state: 'cancelled', endReason: 'vehicle_unavailable' });
    expect(await database.db.select().from(tripIntervals)).toHaveLength(0);
  });
  it('concurrent finish through two API instances creates exactly one invoice; retries do not rebill', async () => {
    const id = await started(), key = randomUUID();
    await delay(5);
    const results = await raceOnOwner(() => [post(`/api/v1/trips/${id}/finish`, 'a', key), post(`/api/v1/trips/${id}/finish`, 'a', randomUUID(), undefined, urlB)]);
    const first = trip(results[0]!);
    expect(trip(results[1]!)).toEqual(first);
    expect(await post(`/api/v1/trips/${id}/finish`, 'a', key)).toEqual(results[0]);
    expect(await database.db.select().from(invoices)).toHaveLength(1);
    expect((await database.db.select().from(tripIntervals)).every(row => row.endedAt !== null)).toBe(true);
  });
  it('atomic finish rolls back the rental and interval if invoice insertion fails', async () => {
    const id = await started(), key = randomUUID();
    await database.pool.query("CREATE FUNCTION reject_test_invoice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test invoice insert failure'; END $$");
    await database.pool.query('CREATE TRIGGER reject_test_invoice BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION reject_test_invoice()');
    try {
      expect((await post(`/api/v1/trips/${id}/finish`, 'a', key)).status).toBe(500);
      expect((await database.db.select().from(rentals))[0]).toMatchObject({ state: 'riding', endedAt: null });
      expect((await database.db.select().from(tripIntervals))[0]?.endedAt).toBeNull();
      expect(await database.db.select().from(invoices)).toHaveLength(0);
    } finally { await database.pool.query('DROP TRIGGER reject_test_invoice ON invoices'); await database.pool.query('DROP FUNCTION reject_test_invoice()'); }
    expect(trip(await post(`/api/v1/trips/${id}/finish`, 'a', key)).trip.state).toBe('finished');
  });
  it('demo payment can decline, then concurrent approved retries produce one receipt', async () => {
    const id = await started(); await delay(5);
    const done = trip(await post(`/api/v1/trips/${id}/finish`));
    if (!done.invoice) throw new Error('No invoice');
    const path = `/api/v1/invoices/${done.invoice.id}/pay-demo`;
    expect((await post(path, 'b')).status).toBe(404);
    const rejected = randomUUID();
    expect(await post(path, 'a', rejected, { outcome: 'declined' })).toMatchObject({ status: 409, data: { code: 'PAYMENT_DECLINED' } });
    expect(await database.db.select().from(demoPayments)).toHaveLength(0);
    expect((await database.db.select().from(invoices))[0]?.status).toBe('unpaid');
    const key = randomUUID();
    const paid = await raceOnOwner(() => [post(path, 'a', key), post(path, 'a', randomUUID(), undefined, urlB)]);
    expect(paid[0]?.status).toBe(200);
    expect(paid[1]).toEqual(paid[0]);
    if (!Value.Check(PaymentResultSchema, paid[0]?.data)) throw new Error('Invalid payment response');
    expect(await post(path, 'a', key)).toEqual(paid[0]);
    expect((await post(path, 'a', key, { outcome: 'declined' })).status).toBe(409);
    expect(await database.db.select().from(demoPayments)).toHaveLength(1);
    expect((await database.db.select().from(invoices))[0]?.status).toBe('paid');
    expect(await get('/api/v1/invoices', 'b')).toMatchObject({ data: { items: [] } });
    expect(await get('/api/v1/trips')).toMatchObject({ data: { items: [expect.objectContaining({ trip: expect.objectContaining({ id }) })] } });
  });
  it('DB rejects overlapping intervals, another open interval and incorrect invoice arithmetic', async () => {
    const id = await started();
    const [open] = await database.db.select().from(tripIntervals);
    if (!open) throw new Error('Missing interval');
    await expect(database.db.insert(tripIntervals).values({ rentalId: id, ordinal: 1, mode: 'paused', startedAt: open.startedAt })).rejects.toThrow();
    await expect(database.db.insert(tripIntervals).values({ rentalId: id, ordinal: 1, mode: 'paused', startedAt: open.startedAt, endedAt: new Date(open.startedAt.getTime() + 1) })).rejects.toThrow();
    const done = trip(await post(`/api/v1/trips/${id}/finish`));
    if (!done.invoice) throw new Error('No invoice');
    await expect(database.db.update(invoices).set({ totalMinor: 123n }).where(eq(invoices.id, done.invoice.id))).rejects.toThrow();
    await expect(database.db.insert(demoPayments).values({ invoiceId: done.invoice.id, amountMinor: 123n, currency: 'KGS', createdAt: new Date() })).rejects.toThrow();
  });
  it('start reads DB time after waiting on the vehicle lock at reservation expiry', async () => {
    const id = await reserved();
    await database.pool.query("UPDATE rentals SET reserved_at=clock_timestamp()-interval '10 seconds', warn_at=clock_timestamp()-interval '5 seconds', expires_at=clock_timestamp()+interval '400 milliseconds' WHERE id=$1", [id]);
    const blocker = await database.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE', [vehicleId]);
    const request = post(`/api/v1/trips/${id}/start`);
    try {
      await delay(550);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    expect(await request).toMatchObject({ status: 409, data: { code: 'RESERVATION_EXPIRED' } });
    expect(await database.db.select().from(tripIntervals)).toHaveLength(0);
    expect((await database.db.select().from(rentals))[0]?.state).toBe('expired');
  });
  it('restores elapsed time on a fresh API and retains tariff/zone snapshots after config changes', async () => {
    const id = await started();
    const before = trip(await get(`/api/v1/trips/${id}`));
    await delay(50);
    const fresh = buildApp(env, { ...config, rideRateMinorPerMinute: 1, serviceZone: { ...zone, version: 'changed' } }, createDatabase(testUrl.toString()));
    try {
      const base = await fresh.listen({ host: '127.0.0.1', port: 0 });
      const recovered = trip(await get(`/api/v1/trips/${id}`, 'a', base));
      expect(BigInt(recovered.trip.activeMilliseconds)).toBeGreaterThan(BigInt(before.trip.activeMilliseconds));
      expect(recovered.trip).toMatchObject({ rideRateMinorPerMinute: 800, zoneVersion: zone.version });
      expect(trip(await post(`/api/v1/trips/${id}/finish`, 'a', randomUUID(), undefined, base)).invoice?.totalMinor).toBe('800');
    } finally { await fresh.close(); }
    expect(await database.db.select().from(rentals).where(and(eq(rentals.id, id), eq(rentals.state, 'finished')))).toHaveLength(1);
  });
});
