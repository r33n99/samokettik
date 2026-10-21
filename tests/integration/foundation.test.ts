import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnvironment } from "../../apps/server/src/config/env.js";
import { loadBusinessConfig } from "../../apps/server/src/config/business.js";
import { migrationsPath } from "../../apps/server/src/config/paths.js";
import { createDatabase } from "../../apps/server/src/db/client.js";
import { seedDatabase } from "../../apps/server/src/db/seed-data.js";
import { redistributeDemoVehicles } from "../../apps/server/src/db/redistribute-data.js";
import { DEMO_USER_IDS } from "../../apps/server/src/config/demo-identities.js";
import { users, vehicles } from "../../apps/server/src/db/schema.js";
import { buildApp } from "../../apps/server/src/app.js";
import { recordReservationHeartbeat } from "../../apps/server/src/jobs/reservations.js";
import { recordTransportHeartbeat } from "../../apps/server/src/jobs/transport.js";

const env = loadEnvironment();
const config = loadBusinessConfig();
const testDbName = `samokettik_test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Pool({
  connectionString: env.databaseUrl,
  connectionTimeoutMillis: 2000,
});
const testUrl = new URL(env.databaseUrl);
testUrl.pathname = `/${testDbName}`;
const database = createDatabase(testUrl.toString());
const app = buildApp({ ...env, logLevel: "silent" }, config, database);
let created = false;
beforeAll(async () => {
  // Only this newly generated test database is ever removed.
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(testDbName))
    throw new Error("Unsafe test DB name");
  await admin.query(`CREATE DATABASE "${testDbName}"`);
  created = true;
  await migrate(database.db, { migrationsFolder: migrationsPath });
  await recordReservationHeartbeat(database, config);
  await recordTransportHeartbeat(database, config);
});
afterAll(async () => {
  await app.close();
  if (created) await admin.query(`DROP DATABASE "${testDbName}" WITH (FORCE)`);
  await admin.end();
});

describe("real PostgreSQL foundation", () => {
  it("applies migration twice without duplicate DDL", async () => {
    await migrate(database.db, { migrationsFolder: migrationsPath });
    expect((await app.inject("/health/ready")).statusCode).toBe(200);
  });
  it("seeds exactly 30 scooters and two users; preserves existing rows on repeat", async () => {
    await seedDatabase(database, config);
    await database.db
      .update(vehicles)
      .set({ batteryBp: 4321 })
      .where(eq(vehicles.publicCode, "SK-001"));
    await seedDatabase(database, config);
    expect(await database.db.select({ count: count() }).from(vehicles)).toEqual(
      [{ count: 30 }],
    );
    expect(await database.db.select({ count: count() }).from(users)).toEqual([
      { count: 2 },
    ]);
    const [preserved] = await database.db
      .select()
      .from(vehicles)
      .where(eq(vehicles.publicCode, "SK-001"));
    expect(preserved?.batteryBp).toBe(4321);
  });
  it("rechecks rentals committed while redistribution waits for a vehicle lock", async () => {
    const owner = await database.pool.connect();
    const targetId = '10000000-0000-4000-8000-000000000005';
    const rentalId = randomUUID();
    const before = await database.db.select().from(vehicles).where(eq(vehicles.id, targetId));
    await owner.query('BEGIN');
    await owner.query('SELECT id FROM vehicles WHERE id=$1 FOR UPDATE', [targetId]);
    const pending = redistributeDemoVehicles(database, config);
    // Observe an actual PostgreSQL lock wait, rather than assuming overlap.
    const deadline = Date.now() + 1500;
    let waiting = false;
    try {
      while (Date.now() < deadline) {
        const result = await database.pool.query<{ count: string }>("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND state='active'");
        if (Number(result.rows[0]?.count) >= 1) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await owner.query("INSERT INTO rentals (id,user_id,vehicle_id,state,reserved_at,warn_at,expires_at,minimum_battery_bp) VALUES ($1,$2,$3,'reserved',clock_timestamp(),clock_timestamp()+interval '12 minutes',clock_timestamp()+interval '15 minutes',1500)", [rentalId, DEMO_USER_IDS.ru, targetId]);
      await owner.query('COMMIT');
      expect((await pending).skippedActive).toBe(1);
      expect(await database.db.select().from(vehicles).where(eq(vehicles.id, targetId))).toEqual(before);
    } finally {
      await owner.query('ROLLBACK'); owner.release();
      await pending.catch(() => {});
      await database.pool.query('DELETE FROM rentals WHERE id=$1', [rentalId]);
    }
  });
  it("enforces battery, coordinate and uniqueness constraints", async () => {
    const row = {
      publicCode: "BAD-TEST",
      batteryBp: 10001,
      latitudeE7: 428740000,
      longitudeE7: 746020000,
    };
    await expect(database.db.insert(vehicles).values(row)).rejects.toThrow();
    await expect(
      database.db
        .insert(vehicles)
        .values({ ...row, batteryBp: 5000, latitudeE7: 900000001 }),
    ).rejects.toThrow();
    await expect(
      database.db
        .insert(vehicles)
        .values({ ...row, publicCode: "SK-001", batteryBp: 5000 }),
    ).rejects.toThrow();
  });
  it("API returns the real database fleet count without private user data", async () => {
    const response = await app.inject("/api/v1/system");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "СамоКеттик",
      vehicleCount: 30,
      timezone: "Asia/Bishkek",
      currency: "KGS",
    });
    expect(response.body).not.toContain("example.test");
  });
  it("publishes business configuration without secrets and gates demo login by explicit mode and Origin", async () => {
    const response = await app.inject("/api/v1/client-config");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      rideRateMinorPerMinute: 800,
      pauseRateMinorPerMinute: 200,
    });
    for (const secret of [
      env.demoRuToken,
      env.demoKyToken,
      env.demoSessionSecret,
    ])
      if (secret) expect(response.body).not.toContain(secret);
    if (env.demoBrowserEnabled) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/demo/session",
            payload: { profile: "ru" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/demo/session",
            headers: { origin: env.wsAllowedOrigins[0]! },
            payload: { profile: "other" },
          })
        ).statusCode,
      ).toBe(400);
      const login = await app.inject({
        method: "POST",
        url: "/api/v1/demo/session",
        headers: { origin: env.wsAllowedOrigins[0]! },
        payload: { profile: "ru" },
      });
      expect(login.statusCode).toBe(200);
      expect(login.headers["cache-control"]).toBe("no-store");
      const token: string = login.json().token;
      expect(
        (
          await app.inject({
            url: "/api/v1/sync",
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            url: "/api/v1/sync",
            headers: {
              authorization: `Bearer ${token.replace(".ru.", ".ky.")}`,
            },
          })
        ).statusCode,
      ).toBe(401);
    }
  });
  it("keeps the browser demo chooser closed when explicitly disabled", async () => {
    const disabled = buildApp(
      { ...env, demoBrowserEnabled: false, logLevel: "silent" },
      config,
      createDatabase(testUrl.toString()),
    );
    try {
      expect(
        (await disabled.inject("/api/v1/client-config")).json(),
      ).toMatchObject({ demoBrowserEnabled: false, profiles: [] });
      expect(
        (
          await disabled.inject({
            method: "POST",
            url: "/api/v1/demo/session",
            headers: { origin: env.wsAllowedOrigins[0]! },
            payload: { profile: "ru" },
          })
        ).statusCode,
      ).toBe(503);
    } finally {
      await disabled.close();
    }
  });
  it("liveness stays alive while readiness fails for unavailable database", async () => {
    const unreachable = new URL(env.databaseUrl);
    unreachable.port = "1";
    const offlineApp = buildApp(
      { ...env, logLevel: "silent" },
      config,
      createDatabase(unreachable.toString()),
    );
    try {
      expect((await offlineApp.inject("/health/live")).statusCode).toBe(200);
      const response = await offlineApp.inject("/health/ready");
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: "DATABASE_NOT_READY" });
      expect(response.body).not.toContain(env.databaseUrl);
    } finally {
      await offlineApp.close();
    }
  });
  it("readiness fails for a database without application migrations", async () => {
    const emptyUrl = new URL(testUrl);
    emptyUrl.searchParams.set("options", "-csearch_path=pg_catalog");
    const emptyApp = buildApp(
      { ...env, logLevel: "silent" },
      config,
      createDatabase(emptyUrl.toString()),
    );
    try {
      expect((await emptyApp.inject("/health/ready")).statusCode).toBe(503);
    } finally {
      await emptyApp.close();
    }
  });
});
