import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Value } from "@sinclair/typebox/value";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ReservationResultSchema } from "@samokettik/contracts";
import { loadEnvironment } from "../../apps/server/src/config/env.js";
import { loadBusinessConfig } from "../../apps/server/src/config/business.js";
import {
  projectRoot,
  migrationsPath,
} from "../../apps/server/src/config/paths.js";
import { createDatabase } from "../../apps/server/src/db/client.js";
import { seedDatabase } from "../../apps/server/src/db/seed-data.js";
import { buildApp } from "../../apps/server/src/app.js";

const config = loadBusinessConfig();
const env = {
  ...loadEnvironment(),
  logLevel: "silent" as const,
  demoAuthEnabled: true,
  demoRuToken: randomUUID().replaceAll("-", "").repeat(2),
  demoKyToken: randomUUID().replaceAll("-", "").repeat(2),
};
const name = `samokettik_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(env.databaseUrl);
url.pathname = `/${name}`;
const admin = new pg.Pool({ connectionString: env.databaseUrl });
const database = createDatabase(url.toString());
const app = buildApp(env, config, database);
let created = false,
  base = "",
  worker: ChildProcess | undefined;
const stamp = () =>
  new Date(Date.now() + 6 * 3600000).toISOString().replace("Z", "+06:00");
function startWorker() {
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/src/entrypoints/worker.ts"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        API_LOG_LEVEL: "silent",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  worker.stdout?.on("data", () => {});
  worker.stderr?.on("data", () => {});
}
async function stopWorker() {
  const child = worker;
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
}
beforeAll(async () => {
  expect(config.reservationDurationSeconds).toBe(900);
  expect(config.reservationWarningBeforeSeconds).toBe(180);
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(name))
    throw new Error("Unsafe test database");
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await migrate(database.db, { migrationsFolder: migrationsPath });
  await seedDatabase(database, config);
  base = await app.listen({ host: "127.0.0.1", port: 0 });
  startWorker();
});
afterAll(async () => {
  await stopWorker();
  await app.close();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
});

it("uses an actual 15-minute reservation, warns at minute 12, survives worker restart and expires once without a browser", async () => {
  const startedAt = stamp();
  const response = await fetch(base + "/api/v1/reservations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.demoRuToken}`,
      "idempotency-key": randomUUID(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ vehicleId: "10000000-0000-4000-8000-000000000005" }),
  });
  expect(response.status).toBe(201);
  const result: unknown = await response.json();
  if (!Value.Check(ReservationResultSchema, result))
    throw new Error("Invalid reservation");
  const booking = result.reservation;
  expect(Date.parse(booking.expiresAt) - Date.parse(booking.reservedAt)).toBe(
    900000,
  );
  expect(Date.parse(booking.expiresAt) - Date.parse(booking.warnAt)).toBe(
    180000,
  );
  console.log(
    JSON.stringify({
      event: "clock-test-reserved",
      recordedAt: stamp(),
      reservedAt: booking.reservedAt,
      warnAt: booking.warnAt,
      expiresAt: booking.expiresAt,
      testDatabase: name,
    }),
  );
  let warningObservedAt: string | null = null,
    expiredObservedAt: string | null = null,
    restartedAt: string | null = null,
    lastMinute = -1;
  const end = Date.now() + 925000;
  while (Date.now() < end) {
    if (worker?.exitCode !== null)
      throw new Error("Acceptance worker exited unexpectedly");
    const {
      rows: [row],
    } = await database.pool.query<{
      state: string;
      now_ms: string;
      warning_count: number;
      expiry_count: number;
      warning_ms: string | null;
      expired_ms: string | null;
      ended_ms: string | null;
    }>(
      `SELECT state,floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms,(SELECT count(*)::int FROM notifications WHERE rental_id=$1 AND code='RESERVATION_EXPIRING') AS warning_count,(SELECT count(*)::int FROM notifications WHERE rental_id=$1 AND code='RESERVATION_EXPIRED') AS expiry_count,(SELECT floor(extract(epoch FROM min(created_at))*1000)::bigint FROM notifications WHERE rental_id=$1 AND code='RESERVATION_EXPIRING') AS warning_ms,(SELECT floor(extract(epoch FROM min(created_at))*1000)::bigint FROM notifications WHERE rental_id=$1 AND code='RESERVATION_EXPIRED') AS expired_ms,floor(extract(epoch FROM ended_at)*1000)::bigint AS ended_ms FROM rentals WHERE id=$1`,
      [booking.id],
    );
    if (!row) throw new Error("Missing reservation");
    const now = Number(row.now_ms),
      minute = Math.floor((now - Date.parse(booking.reservedAt)) / 60000);
    if (minute !== lastMinute) {
      lastMinute = minute;
      console.log(
        JSON.stringify({
          event: "clock-test-progress",
          recordedAt: stamp(),
          elapsedMinutes: minute,
          state: row.state,
          warnings: row.warning_count,
        }),
      );
    }
    expect(row.warning_count).toBeLessThanOrEqual(1);
    expect(row.expiry_count).toBeLessThanOrEqual(1);
    if (now < Date.parse(booking.warnAt)) expect(row.warning_count).toBe(0);
    if (now < Date.parse(booking.expiresAt)) {
      expect(row.state).toBe("reserved");
      expect(row.expiry_count).toBe(0);
    }
    if (row.warning_ms && !warningObservedAt) {
      expect(Number(row.warning_ms)).toBeGreaterThanOrEqual(
        Date.parse(booking.warnAt),
      );
      expect(
        Number(row.warning_ms) - Date.parse(booking.warnAt),
      ).toBeLessThanOrEqual(5000);
      warningObservedAt = stamp();
      await stopWorker();
      startWorker();
      restartedAt = stamp();
      console.log(
        JSON.stringify({
          event: "clock-test-warning-and-worker-restart",
          recordedAt: warningObservedAt,
        }),
      );
    }
    if (row.state === "expired") {
      expect(warningObservedAt).not.toBeNull();
      expect(row.warning_count).toBe(1);
      expect(row.expiry_count).toBe(1);
      expect(Number(row.ended_ms)).toBe(Date.parse(booking.expiresAt));
      expect(
        Number(row.expired_ms) - Date.parse(booking.expiresAt),
      ).toBeGreaterThanOrEqual(0);
      expect(
        Number(row.expired_ms) - Date.parse(booking.expiresAt),
      ).toBeLessThanOrEqual(5000);
      expiredObservedAt = stamp();
      break;
    }
    await delay(500);
  }
  expect(expiredObservedAt).not.toBeNull();
  const fleet = (await fetch(base + "/api/v1/vehicles").then((r) =>
    r.json(),
  )) as { items: { id: string; status: string }[] };
  expect(fleet.items.find((v) => v.id === booking.vehicleId)?.status).toBe(
    "available",
  );
  await mkdir("outputs/case11-audit", { recursive: true });
  await writeFile(
    "outputs/case11-audit/reservation-clock.json",
    JSON.stringify(
      {
        startedAt,
        completedAt: stamp(),
        reservedAt: booking.reservedAt,
        warnAt: booking.warnAt,
        expiresAt: booking.expiresAt,
        warningObservedAt,
        restartedAt,
        expiredObservedAt,
        configuredDurationSeconds: 900,
        configuredWarningBeforeSeconds: 180,
        testDatabase: name,
        clockOrDeadlineModified: false,
        browserRequired: false,
      },
      null,
      2,
    ),
  );
});
