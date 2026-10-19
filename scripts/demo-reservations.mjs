import { loadEnvFile } from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const base = process.env.RESERVATION_API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? '3001'}`;
const identities = [process.env.DEMO_USER_RU_TOKEN, process.env.DEMO_USER_KY_TOKEN];
if (process.env.DEMO_AUTH_ENABLED !== 'true' || identities.some(token => !token || token.startsWith('replace-'))) throw new Error('Run npm run setup and enable local demo auth first');
async function get(path, token) {
  const response = await fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`GET ${path} returned ${response.status}`);
  return response.json();
}
async function post(path, token, key, body) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
let winner;
try {
  for (const token of identities) if ((await get('/api/v1/rentals/current', token)).reservation) throw new Error('A demo user already has an active reservation. Cancel it before running this demo.');
  const { items } = await get('/api/v1/vehicles');
  const vehicle = items.find(item => item.status === 'available');
  if (!vehicle) throw new Error('No available scooter');
  const keys = [randomUUID(), randomUUID()];
  const results = await Promise.all(identities.map((token, index) => post('/api/v1/reservations', token, keys[index], { vehicleId: vehicle.id })));
  const winnerIndex = results.findIndex(result => result.status === 201);
  if (winnerIndex >= 0) winner = { token: identities[winnerIndex], id: results[winnerIndex].body.reservation.id };
  if (results.filter(result => result.status === 201).length !== 1 || results.filter(result => result.status === 409).length !== 1) throw new Error(`Unexpected race statuses: ${results.map(result => result.status).join(',')}`);
  const replay = await post('/api/v1/reservations', identities[winnerIndex], keys[winnerIndex], { vehicleId: vehicle.id });
  if (JSON.stringify(replay) !== JSON.stringify(results[winnerIndex])) throw new Error('Idempotent replay did not match');
  console.log(JSON.stringify({ vehicleCode: vehicle.publicCode, raceStatuses: results.map(result => result.status), replayMatches: true }, null, 2));
} finally {
  if (winner) {
    const cancelled = await post(`/api/v1/reservations/${winner.id}/cancel`, winner.token, randomUUID());
    if (cancelled.status !== 200) throw new Error(`Demo cleanup failed: ${cancelled.status}`);
    console.log('Demo reservation cancelled; scooter released.');
  }
}
