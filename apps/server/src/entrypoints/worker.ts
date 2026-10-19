import { loadEnvironment } from '../config/env.js';
import { loadBusinessConfig } from '../config/business.js';
import { createDatabase } from '../db/client.js';
import { runReservationWorker } from '../jobs/loop.js';
const env = loadEnvironment();
const database = createDatabase(env.databaseUrl);
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort());
try { await runReservationWorker(database, loadBusinessConfig(), env, controller.signal); }
finally { await database.close(); }
