import { loadEnvironment } from '../config/env.js';
import { loadBusinessConfig } from '../config/business.js';
import { createDatabase } from '../db/client.js';
import { reservationWorkerHealthy } from './reservations.js';
const env = loadEnvironment();
const database = createDatabase(env.databaseUrl);
try { if (!await reservationWorkerHealthy(database, loadBusinessConfig(), env.workerStaleMs)) process.exitCode = 1; }
catch { process.exitCode = 1; }
finally { await database.close(); }
