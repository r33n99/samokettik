import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
loadEnvFile('.env');
assert.equal(process.env.DEMO_AUTH_ENABLED, 'true', 'Enable local demo auth first');
const tokens = [process.env.DEMO_USER_RU_TOKEN, process.env.DEMO_USER_KY_TOKEN];
assert.ok(tokens.every(token => token && !token.startsWith('replace-')));
const base = `http://127.0.0.1:${process.env.WEB_PORT ?? '5173'}`, config = JSON.parse(await readFile('config/demo.json', 'utf8'));
const sockets = [];
let rentalId, finished = false;
async function get(path, token) {
  const response = await fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, path); return response.json();
}
async function post(path, token, key = randomUUID(), body) {
  const response = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
async function until(condition) {
  const deadline = Date.now() + config.simulationTickMs + 7000;
  while (Date.now() < deadline) { if (await condition()) return; await delay(50); }
  throw new Error('Realtime demo condition timed out');
}
async function connect(token) {
  const protocols = ['samokettik.v1'];
  if (token) { const ticket = await post('/api/v1/realtime/tickets', token); assert.equal(ticket.status, 200); protocols.push(`ticket.${ticket.body.ticket}`); }
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/api/v1/realtime', protocols, { origin: base });
  sockets.push(socket); const frames = []; let error;
  socket.on('error', () => { error = new Error('WebSocket demo connection failed'); });
  socket.on('message', data => frames.push(JSON.parse(data.toString())));
  await until(() => { if (error) throw error; return frames.length > 0; });
  return { socket, frames };
}
try {
  for (const token of tokens) { const current = await get('/api/v1/rentals/current', token); assert.ok(!current.reservation && !current.trip, 'A demo user has an active rental; refusing to change it'); }
  const publicClient = await connect(), owner = await connect(tokens[0]), other = await connect(tokens[1]);
  const vehicle = (await get('/api/v1/vehicles')).items.find(item => item.status === 'available'); assert.ok(vehicle);
  const reservation = await post('/api/v1/reservations', tokens[0], randomUUID(), { vehicleId: vehicle.id }); assert.equal(reservation.status, 201); rentalId = reservation.body.reservation.id;
  assert.equal((await post(`/api/v1/trips/${rentalId}/start`, tokens[0])).status, 200);
  const latestVehicle = () => publicClient.frames.at(-1)?.fleet?.items.find(item => item.id === vehicle.id);
  await until(() => { const next = latestVehicle(); return next?.status === 'in_ride' && next.batteryBp < vehicle.batteryBp && (next.longitude !== vehicle.longitude || next.latitude !== vehicle.latitude); });
  const first = latestVehicle(); owner.socket.terminate();
  await until(() => { const next = latestVehicle(); return next && (next.longitude !== first.longitude || next.latitude !== first.latitude); });
  const restored = await get('/api/v1/sync', tokens[0]); assert.equal(restored.current.trip.id, rentalId);
  const reconnected = await connect(tokens[0]); assert.equal(reconnected.frames.at(-1).state.current.trip.id, rentalId);
  assert.equal((await post(`/api/v1/trips/${rentalId}/pause`, tokens[0])).status, 200); await delay(100);
  assert.equal((await post(`/api/v1/trips/${rentalId}/resume`, tokens[0])).status, 200);
  const key = randomUUID(), done = await post(`/api/v1/trips/${rentalId}/finish`, tokens[0], key); assert.equal(done.status, 200); finished = true;
  assert.deepEqual(await post(`/api/v1/trips/${rentalId}/finish`, tokens[0], key), done);
  let state;
  await until(async () => { state = await get('/api/v1/sync', tokens[0]); return state.mailbox.items.some(message => message.invoiceId === done.body.invoice.id); });
  assert.equal(state.mailbox.items.filter(message => message.invoiceId === done.body.invoice.id).length, 1);
  assert.equal(state.notifications.items.filter(notice => notice.rentalId === rentalId && notice.code === 'TRIP_FINISHED').length, 1);
  assert.ok(!JSON.stringify(other.frames).includes(rentalId), 'Other user received private rental data');
  assert.ok(!JSON.stringify(publicClient.frames).includes(rentalId), 'Public stream received private rental data');
  console.log(JSON.stringify({ vehicleCode: vehicle.publicCode, initialBatteryBp: vehicle.batteryBp, changedBatteryBp: first.batteryBp, initialPosition: [vehicle.longitude, vehicle.latitude], changedPosition: [first.longitude, first.latitude], parallelClients: 3, continuedWhileOwnerDisconnected: true, restoredViaApiBeforeWs: true, totalMinor: done.body.invoice.totalMinor, localInvoiceMailCount: 1, finishNotificationCount: 1, privacyPassed: true, configuredSimulationTickMs: config.simulationTickMs }, null, 2));
} finally {
  for (const socket of sockets) socket.terminate();
  if (rentalId && !finished) {
    const current = await get('/api/v1/rentals/current', tokens[0]);
    if (current.reservation?.id === rentalId) assert.equal((await post(`/api/v1/reservations/${rentalId}/cancel`, tokens[0])).status, 200);
    if (current.trip?.id === rentalId) assert.equal((await post(`/api/v1/trips/${rentalId}/finish`, tokens[0])).status, 200, 'Demo cleanup failed');
  }
}
