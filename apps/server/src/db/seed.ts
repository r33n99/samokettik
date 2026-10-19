import { loadEnvironment } from '../config/env.js';
import { loadBusinessConfig } from '../config/business.js';
import { createDatabase } from './client.js';
import { demoUsers } from './fixtures.js';
import { seedDatabase } from './seed-data.js';
const env = loadEnvironment();
if (!env.demoSeedEnabled) throw new Error('Demo seed is disabled. Set DEMO_SEED_ENABLED=true only for a local demo.');
const config = loadBusinessConfig();
const database = createDatabase(env.databaseUrl);
try {
  await seedDatabase(database, config);
  console.log(`Seed complete: ${config.fleetSize} deterministic vehicle fixtures and ${demoUsers.length} users (no login credentials yet). Existing rows preserved.`);
} catch {
  console.error('Demo seed failed. Apply migrations and check database constraints.');
  process.exitCode = 1;
} finally { await database.close(); }
