// Live demo acceptance check. Run from the repository root with Compose running.
// Only this check's new reservation has its timestamps shifted to accelerate expiry.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

loadEnvFile('.env');
const config = JSON.parse(await readFile('config/demo.json', 'utf8'));
assert.equal(process.env.DEMO_AUTH_ENABLED, 'true', 'Requires explicit demo authentication');
const tokens = [process.env.DEMO_USER_RU_TOKEN, process.env.DEMO_USER_KY_TOKEN];
assert.ok(tokens.every(token => token && !token.startsWith('replace-')), 'Missing demo tokens');
const base = `http://127.0.0.1:${process.env.API_PORT ?? '3001'}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const timestamp = () => new Date(Date.now() + 6 * 3600000).toISOString().replace('Z', '+06:00');
const report = { startedAt: timestamp(), mode: 'live Compose API + PostgreSQL + independent worker', fixture: 'Only the newly created reservation is backdated; expiry is accelerated to DB now + 3 seconds. Production config is unchanged.', steps: [] };
const owned = [];
async function get(path, token) {
  const response = await fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, `GET ${path}`);
  return response.json();
}
async function post(path, token, key, body) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
  const result = { status: response.status, body: await response.json() };
  if (path === '/api/v1/reservations' && response.status === 201) owned.push({ id: result.body.reservation.id, token });
  return result;
}
try {
  report.readiness = await get('/health/ready');
  for (const token of tokens) assert.equal((await get('/api/v1/rentals/current', token)).reservation, null, 'Demo user already has an active reservation; refusing to modify it');
  const vehicle = (await get('/api/v1/vehicles')).items.find(item => item.status === 'available');
  assert.ok(vehicle, 'No available scooter');
  report.vehicleCode = vehicle.publicCode;
  const keyA = randomUUID();
  const first = await post('/api/v1/reservations', tokens[0], keyA, { vehicleId: vehicle.id });
  assert.equal(first.status, 201);
  const booking = first.body.reservation;
  assert.equal(Date.parse(booking.expiresAt) - Date.parse(booking.reservedAt), config.reservationDurationSeconds * 1000);
  assert.equal(Date.parse(booking.expiresAt) - Date.parse(booking.warnAt), config.reservationWarningBeforeSeconds * 1000);
  const keyB = randomUUID();
  const second = await post('/api/v1/reservations', tokens[1], keyB, { vehicleId: vehicle.id });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'VEHICLE_NOT_AVAILABLE');
  const active = (await pool.query("SELECT id, user_id FROM rentals WHERE vehicle_id=$1 AND state='reserved'", [vehicle.id])).rows;
  assert.equal(active.length, 1);
  assert.equal(active[0].id, booking.id);
  const reservedVehicle = (await get('/api/v1/vehicles')).items.find(item => item.id === vehicle.id);
  assert.equal(reservedVehicle.status, 'reserved');
  report.steps.push({ at: timestamp(), check: 'Occupied scooter rejects the second user', firstStatus: first.status, secondStatus: second.status, errorCode: second.body.code, activeRows: active.length, vehicleStatus: reservedVehicle.status, durationSeconds: config.reservationDurationSeconds, warningBeforeSeconds: config.reservationWarningBeforeSeconds });
  const replay = await post('/api/v1/reservations', tokens[0], keyA, { vehicleId: vehicle.id });
  assert.deepEqual(replay, first);
  report.steps.push({ at: timestamp(), check: 'Identical request replays the original result', passed: true });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [active[0].user_id]);
    await client.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE', [vehicle.id]);
    await client.query('SELECT id FROM rentals WHERE id=$1 FOR UPDATE', [booking.id]);
    const shifted = await client.query(`WITH deadline AS MATERIALIZED (SELECT date_trunc('milliseconds', clock_timestamp()) + interval '3 seconds' AS expires)
      UPDATE rentals SET reserved_at=deadline.expires-$2*interval '1 second', warn_at=deadline.expires-$3*interval '1 second', expires_at=deadline.expires
      FROM deadline WHERE id=$1 AND state='reserved' RETURNING expires_at`, [booking.id, config.reservationDurationSeconds, config.reservationWarningBeforeSeconds]);
    assert.equal(shifted.rowCount, 1);
    report.acceleratedDeadline = shifted.rows[0].expires_at.toISOString();
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }

  // No HTTP reserve/cancel/current/list calls or manual job execution in this loop.
  const waitUntil = Date.now() + 10000;
  let terminal;
  while (Date.now() < waitUntil) {
    const row = (await pool.query(`SELECT state, end_reason, ended_at=expires_at AS ended_at_equals_deadline, clock_timestamp() AS observed_at,
      (SELECT count(*)::int FROM notifications WHERE rental_id=$1 AND code='RESERVATION_EXPIRED') AS expiry_notifications,
      (SELECT count(*)::int FROM rentals WHERE vehicle_id=$2 AND state='reserved') AS active_rows
      FROM rentals WHERE id=$1`, [booking.id, vehicle.id])).rows[0];
    if (row.state === 'expired') { terminal = row; break; }
    await delay(100);
  }
  assert.ok(terminal, 'Independent worker did not expire the booking within 10 seconds');
  assert.equal(terminal.end_reason, 'reservation_expired');
  assert.equal(terminal.ended_at_equals_deadline, true);
  assert.equal(terminal.expiry_notifications, 1);
  assert.equal(terminal.active_rows, 0);
  report.steps.push({ at: timestamp(), check: 'Worker expired the booking before any subsequent rental HTTP request', database: terminal });
  assert.equal((await get('/api/v1/rentals/current', tokens[0])).reservation, null);
  const released = (await get('/api/v1/vehicles')).items.find(item => item.id === vehicle.id);
  assert.equal(released.status, 'available');
  const rejectedReplay = await post('/api/v1/reservations', tokens[1], keyB, { vehicleId: vehicle.id });
  assert.equal(rejectedReplay.status, second.status, 'A rejected idempotency key must remain rejected');
  assert.equal(rejectedReplay.body.code, second.body.code);
  assert.equal(rejectedReplay.body.message, second.body.message);
  assert.equal(typeof rejectedReplay.body.requestId, 'string'); // Per-HTTP tracing metadata is deliberately fresh.
  const afterExpiry = await post('/api/v1/reservations', tokens[1], randomUUID(), { vehicleId: vehicle.id });
  assert.equal(afterExpiry.status, 201, 'Second user must be able to reserve after automatic expiry');
  report.steps.push({ at: timestamp(), check: 'Second user can reserve the released scooter with a new command', previousOwnerCurrent: null, vehicleStatusBeforeNewBooking: released.status, cachedRejectionStatus: rejectedReplay.status, newBookingStatus: afterExpiry.status });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.cleanup = [];
  for (const booking of new Map(owned.map(item => [item.id, item])).values()) {
    try {
      const state = (await pool.query('SELECT state FROM rentals WHERE id=$1', [booking.id])).rows[0]?.state;
      if (state === 'reserved') {
        const cancelled = await post(`/api/v1/reservations/${booking.id}/cancel`, booking.token, randomUUID());
        assert.equal(cancelled.status, 200);
        report.cleanup.push({ id: booking.id, state: 'cancelled' });
      } else report.cleanup.push({ id: booking.id, state });
    } catch (error) { report.cleanup.push({ id: booking.id, error: error.message }); report.passed = false; process.exitCode = 1; }
  }
  await pool.end();
  report.finishedAt = timestamp();
  await writeFile('docs/evidence/booking-acceptance/result.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
