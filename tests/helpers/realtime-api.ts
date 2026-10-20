import { buildApp } from '../../apps/server/src/app.js';
import { loadEnvironment } from '../../apps/server/src/config/env.js';
import { loadBusinessConfig } from '../../apps/server/src/config/business.js';
import { createDatabase } from '../../apps/server/src/db/client.js';
const env = loadEnvironment();
const app = buildApp({ ...env, logLevel: 'silent' }, loadBusinessConfig(), createDatabase(env.databaseUrl));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close(); });
console.log(JSON.stringify({ event: 'listening', url: await app.listen({ host: '127.0.0.1', port: 0 }) }));
