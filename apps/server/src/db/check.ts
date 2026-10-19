import { count, sql } from 'drizzle-orm';
import { loadEnvironment } from '../config/env.js';
import { createDatabase } from './client.js';
import { appMetadata, users, vehicles } from './schema.js';
const database = createDatabase(loadEnvironment().databaseUrl);
try {
  const result = await database.db.execute(sql`select version() as version, clock_timestamp() as server_time`);
  const metadata = await database.db.select().from(appMetadata);
  const [fleet] = await database.db.select({ count: count() }).from(vehicles);
  const [accounts] = await database.db.select({ count: count() }).from(users);
  console.log(JSON.stringify({ postgres: result.rows[0], metadata, vehicles: fleet?.count, users: accounts?.count }, null, 2));
} catch {
  console.error('Database check failed. Check PostgreSQL and migrations.');
  process.exitCode = 1;
} finally { await database.close(); }
