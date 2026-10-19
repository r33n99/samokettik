import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
loadEnvFile('.env');
// Exercise the same frontend proxy -> API -> PostgreSQL path as the browser.
const base = process.env.TRIP_API_URL ?? `http://127.0.0.1:${process.env.WEB_PORT ?? '5173'}`;
const token = process.env.DEMO_USER_RU_TOKEN;
assert.equal(process.env.DEMO_AUTH_ENABLED, 'true', 'Enable explicit local demo auth first');
assert.ok(token && !token.startsWith('replace-'), 'Missing demo token');
async function get(path) {
  const response = await fetch(base + path, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, path);
  return response.json();
}
async function post(path, key = randomUUID(), body) {
  const response = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
let rentalId, finished = false;
try {
  const current = await get('/api/v1/rentals/current');
  assert.ok(!current.reservation && !current.trip, 'Demo user already has an active rental; refusing to change it');
  const vehicle = (await get('/api/v1/vehicles')).items.find(item => item.status === 'available');
  assert.ok(vehicle, 'No available scooter');
  const reservation = await post('/api/v1/reservations', randomUUID(), { vehicleId: vehicle.id });
  assert.equal(reservation.status, 201);
  rentalId = reservation.body.reservation.id;
  const started = await post(`/api/v1/trips/${rentalId}/start`); assert.equal(started.status, 200);
  await delay(100);
  const paused = await post(`/api/v1/trips/${rentalId}/pause`); assert.equal(paused.status, 200);
  await delay(100);
  const resumed = await post(`/api/v1/trips/${rentalId}/resume`); assert.equal(resumed.status, 200);
  const finishKey = randomUUID();
  const done = await post(`/api/v1/trips/${rentalId}/finish`, finishKey); assert.equal(done.status, 200); finished = true;
  assert.deepEqual(await post(`/api/v1/trips/${rentalId}/finish`, finishKey), done);
  assert.equal(done.body.invoice.totalMinor, '1000');
  const payPath = `/api/v1/invoices/${done.body.invoice.id}/pay-demo`;
  assert.equal((await post(payPath, randomUUID(), { outcome: 'declined' })).status, 409);
  const payKey = randomUUID(), paid = await post(payPath, payKey); assert.equal(paid.status, 200);
  assert.deepEqual(await post(payPath, payKey), paid);
  const restored = await get('/api/v1/rentals/current');
  assert.ok(!restored.reservation && !restored.trip);
  console.log(JSON.stringify({ vehicleCode: vehicle.publicCode, states: [started.body.trip.state, paused.body.trip.state, resumed.body.trip.state, done.body.trip.state], activeMilliseconds: done.body.invoice.activeMilliseconds, pausedMilliseconds: done.body.invoice.pausedMilliseconds, totalMinor: done.body.invoice.totalMinor, currency: done.body.invoice.currency, invoiceStatus: paid.body.invoice.status, provider: paid.body.payment.provider, repeatedFinishMatches: true, repeatedPaymentMatches: true }, null, 2));
} finally {
  if (rentalId && !finished) {
    const current = await get('/api/v1/rentals/current');
    if (current.reservation?.id === rentalId) assert.equal((await post(`/api/v1/reservations/${rentalId}/cancel`)).status, 200);
    if (current.trip?.id === rentalId) {
      const done = await post(`/api/v1/trips/${rentalId}/finish`);
      assert.equal(done.status, 200, 'Demo cleanup could not finish its own trip');
      assert.equal((await post(`/api/v1/invoices/${done.body.invoice.id}/pay-demo`)).status, 200);
    }
  }
}
