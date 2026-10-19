import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const api = 'http://127.0.0.1:3001';
async function command(args) {
  console.log(`COMMAND docker ${args.join(' ')}`);
  const { stdout, stderr } = await run(docker, args, { timeout: 45000 });
  process.stdout.write(stdout + stderr);
}
let stopped = false;
try {
  await command(['compose', 'stop', 'postgres']);
  stopped = true;
  const ready = await fetch(`${api}/health/ready`, { signal: AbortSignal.timeout(6000) });
  const live = await fetch(`${api}/health/live`);
  if (ready.status !== 503 || live.status !== 200) throw new Error(`Incorrect outage health status: ${ready.status}/${live.status}`);
  console.log('OUTAGE: readiness=503, liveness=200');
} finally {
  if (stopped) await command(['compose', 'up', '-d', '--wait', 'postgres']);
}
const ready = await fetch(`${api}/health/ready`);
const data = await fetch(`${api}/api/v1/system`).then(response => response.json());
if (ready.status !== 200 || data.vehicleCount !== 30) throw new Error('Database recovery/persistence check failed');
console.log('RECOVERED: readiness=200, persisted vehicle count=30');
