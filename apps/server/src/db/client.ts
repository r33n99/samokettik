import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
export const databaseTimeouts = { statementMs: 3000, lockMs: 2000 } as const;

export function createDatabase(databaseUrl: string) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000,
    statement_timeout: databaseTimeouts.statementMs,
    application_name: 'samokettik',
  });
  // Idle connection errors must not crash Node with an unhandled emitter event.
  pool.on('error', () => console.error('PostgreSQL idle connection failed; subsequent requests will reconnect.'));
  return { pool, db: drizzle(pool, { schema }), connectionString: databaseUrl, close: () => pool.end() };
}
export type Database = ReturnType<typeof createDatabase>;
