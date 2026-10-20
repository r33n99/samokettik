import { loadEnvironment } from '../config/env.js';
import { loadBusinessConfig } from '../config/business.js';
import { createDatabase } from '../db/client.js';
import { reservationWorkerHealthy } from './reservations.js';
import { transportWorkerHealthy } from './transport.js';
const env = loadEnvironment();
const database = createDatabase(env.databaseUrl);
try { const config = loadBusinessConfig(); if (!await reservationWorkerHealthy(database, config, env.workerStaleMs) || !await transportWorkerHealthy(database, config, env.workerStaleMs)) process.exitCode = 1; }
catch { process.exitCode = 1; }
finally { await database.close(); }
