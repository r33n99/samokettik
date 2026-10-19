import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnvironment } from '../config/env.js';
import { migrationsPath } from '../config/paths.js';
import { createDatabase } from './client.js';
const database = createDatabase(loadEnvironment().databaseUrl);
try {
  await migrate(database.db, { migrationsFolder: migrationsPath });
  console.log('Database migrations applied.');
} catch {
  console.error('Database migration failed. Check PostgreSQL, credentials and migration SQL.');
  process.exitCode = 1;
} finally { await database.close(); }
