import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../apps/server/src/config/env.js';
import { loadBusinessConfig } from '../../apps/server/src/config/business.js';
import { migrationsPath } from '../../apps/server/src/config/paths.js';
import { createDatabase } from '../../apps/server/src/db/client.js';
import { seedDatabase } from '../../apps/server/src/db/seed-data.js';
import { users, vehicles } from '../../apps/server/src/db/schema.js';
import { buildApp } from '../../apps/server/src/app.js';
import { recordReservationHeartbeat } from '../../apps/server/src/jobs/reservations.js';

const env = loadEnvironment();
const config = loadBusinessConfig();
const testDbName = `samokettik_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString: env.databaseUrl, connectionTimeoutMillis: 2000 });
const testUrl = new URL(env.databaseUrl);
testUrl.pathname = `/${testDbName}`;
const database = createDatabase(testUrl.toString());
const app = buildApp({ ...env, logLevel: 'silent' }, config, database);
let created = false;
beforeAll(async () => {
  // Only this newly generated test database is ever removed.
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(testDbName)) throw new Error('Unsafe test DB name');
  await admin.query(`CREATE DATABASE "${testDbName}"`);
  created = true;
  await migrate(database.db, { migrationsFolder: migrationsPath });
  await recordReservationHeartbeat(database, config);
});
afterAll(async () => {
  await app.close();
  if (created) await admin.query(`DROP DATABASE "${testDbName}" WITH (FORCE)`);
  await admin.end();
});

describe('real PostgreSQL foundation', () => {
  it('applies migration twice without duplicate DDL', async () => {
    await migrate(database.db, { migrationsFolder: migrationsPath });
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
  });
  it('seeds exactly 30 scooters and two users; preserves existing rows on repeat', async () => {
    await seedDatabase(database, config);
    await database.db.update(vehicles).set({ batteryBp: 4321 }).where(eq(vehicles.publicCode, 'SK-001'));
    await seedDatabase(database, config);
    expect(await database.db.select({ count: count() }).from(vehicles)).toEqual([{ count: 30 }]);
    expect(await database.db.select({ count: count() }).from(users)).toEqual([{ count: 2 }]);
    const [preserved] = await database.db.select().from(vehicles).where(eq(vehicles.publicCode, 'SK-001'));
    expect(preserved?.batteryBp).toBe(4321);
  });
  it('enforces battery, coordinate and uniqueness constraints', async () => {
    const row = { publicCode: 'BAD-TEST', batteryBp: 10001, latitudeE7: 428740000, longitudeE7: 746020000 };
    await expect(database.db.insert(vehicles).values(row)).rejects.toThrow();
    await expect(database.db.insert(vehicles).values({ ...row, batteryBp: 5000, latitudeE7: 900000001 })).rejects.toThrow();
    await expect(database.db.insert(vehicles).values({ ...row, publicCode: 'SK-001', batteryBp: 5000 })).rejects.toThrow();
  });
  it('API returns the real database fleet count without private user data', async () => {
    const response = await app.inject('/api/v1/system');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'СамоКеттик', vehicleCount: 30, timezone: 'Asia/Bishkek', currency: 'KGS' });
    expect(response.body).not.toContain('example.test');
  });
  it('liveness stays alive while readiness fails for unavailable database', async () => {
    const unreachable = new URL(env.databaseUrl);
    unreachable.port = '1';
    const offlineApp = buildApp({ ...env, logLevel: 'silent' }, config, createDatabase(unreachable.toString()));
    try {
      expect((await offlineApp.inject('/health/live')).statusCode).toBe(200);
      const response = await offlineApp.inject('/health/ready');
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'DATABASE_NOT_READY' });
      expect(response.body).not.toContain(env.databaseUrl);
    } finally { await offlineApp.close(); }
  });
  it('readiness fails for a database without application migrations', async () => {
    const emptyUrl = new URL(testUrl);
    emptyUrl.searchParams.set('options', '-csearch_path=pg_catalog');
    const emptyApp = buildApp({ ...env, logLevel: 'silent' }, config, createDatabase(emptyUrl.toString()));
    try { expect((await emptyApp.inject('/health/ready')).statusCode).toBe(503); }
    finally { await emptyApp.close(); }
  });
});
