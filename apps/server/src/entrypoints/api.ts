import { loadEnvironment } from '../config/env.js';
import { loadBusinessConfig } from '../config/business.js';
import { createDatabase } from '../db/client.js';
import { buildApp } from '../app.js';
const env = loadEnvironment();
const app = buildApp(env, loadBusinessConfig(), createDatabase(env.databaseUrl));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
try { await app.listen({ host: env.host, port: env.port }); }
catch {
  console.error('API startup failed. Check API_HOST/API_PORT and runtime configuration.');
  await app.close();
  process.exitCode = 1;
}
