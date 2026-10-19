import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { npmCommand } from '../scripts/npm-command.mjs';
// Host-only .env bind address; preserve its generated password and all other values.
const envText = await readFile('.env', 'utf8');
await writeFile('.env', envText.replace(/^API_HOST=0\.0\.0\.0$/m, 'API_HOST=127.0.0.1'));
const invocation = npmCommand(['run', 'dev']);
const child = spawn(invocation.command, invocation.args, {
  env: { ...process.env, API_PORT: '3003', WEB_PORT: '5175', VITE_PROXY_TARGET: 'http://127.0.0.1:3003' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.toString(); });
const base = 'http://127.0.0.1:5175';
try {
  let ready = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { ready = (await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok; }
    catch { /* dev processes still starting */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Dev startup timed out');
  const page = await fetch(base);
  const html = await page.text();
  const data = await fetch(`${base}/api/v1/system`).then(response => response.json());
  if (!page.ok || !html.includes('/@vite/client') || data.vehicleCount !== 30) throw new Error('Dev frontend/proxy/data flow failed');
  console.log(JSON.stringify({ devFrontend: page.status, viteClient: true, proxyVehicleCount: data.vehicleCount, apiPort: 3003, webPort: 5175 }));
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (child.pid) {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  await writeFile('work/dev-smoke.log', output);
}
