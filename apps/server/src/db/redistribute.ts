import { loadEnvironment } from '../config/env.js';
import { loadBusinessConfig } from '../config/business.js';
import { createDatabase } from './client.js';
import { redistributeDemoVehicles } from './redistribute-data.js';

const env = loadEnvironment();
if (!env.demoSeedEnabled) throw new Error('Demo redistribution requires DEMO_SEED_ENABLED=true');
const config = loadBusinessConfig();
const database = createDatabase(env.databaseUrl);
try {
  console.log(JSON.stringify(await redistributeDemoVehicles(database, config)));
} catch {
  console.error('Demo redistribution failed; transaction rolled back. Check database availability and concurrent operations.');
  process.exitCode = 1;
} finally { await database.close(); }
