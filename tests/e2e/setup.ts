import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadEnvironment } from "../../apps/server/src/config/env.js";
import { loadBusinessConfig } from "../../apps/server/src/config/business.js";
import { createDatabase } from "../../apps/server/src/db/client.js";
import {
  migrationsPath,
  projectRoot,
} from "../../apps/server/src/config/paths.js";
import { seedDatabase } from "../../apps/server/src/db/seed-data.js";

export default async function setup() {
  const env = loadEnvironment(),
    name = `samokettik_test_${randomUUID().replaceAll("-", "")}`,
    url = new URL(env.databaseUrl);
  url.pathname = "/" + name;
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(name))
    throw new Error("Unsafe E2E database");
  const admin = new pg.Pool({ connectionString: env.databaseUrl }),
    children: ChildProcess[] = [];
  let created = false;
  const webPort = Number(process.env["E2E_WEB_PORT"] ?? "5180"),
    base = `http://127.0.0.1:${webPort}`;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url.toString(),
    DEMO_AUTH_ENABLED: "true",
    DEMO_BROWSER_ENABLED: "true",
    DEMO_USER_RU_TOKEN: randomBytes(32).toString("hex"),
    DEMO_USER_KY_TOKEN: randomBytes(32).toString("hex"),
    DEMO_SESSION_SECRET: randomBytes(32).toString("hex"),
    DEMO_SESSION_SECONDS: "60",
    WS_ALLOWED_ORIGINS: base,
    BOOKING_JOB_POLL_MS: "100",
  };
  async function cleanup() {
    for (const child of children.reverse()) {
      if (child.exitCode === null) {
        const ended = new Promise<void>((resolve) =>
          child.once("exit", () => resolve()),
        );
        child.kill();
        await Promise.race([ended, delay(3000)]);
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      }
    }
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
  function launch(args: string[], cwd = projectRoot) {
    const child = spawn(process.execPath, args, {
      cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});
    return child;
  }
  async function until(check: () => Promise<boolean>, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await check()) return;
      await delay(100);
    }
    throw new Error("Isolated E2E service did not become ready");
  }
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const database = createDatabase(url.toString());
    try {
      await migrate(database.db, { migrationsFolder: migrationsPath });
      await seedDatabase(database, loadBusinessConfig());
    } finally {
      await database.close();
    }
    const api = launch(["--import", "tsx", "tests/helpers/realtime-api.ts"]);
    let apiUrl: string | undefined,
      output = "";
    api.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      for (const line of output.split("\n")) {
        try {
          const data: unknown = JSON.parse(line);
          if (
            data &&
            typeof data === "object" &&
            "url" in data &&
            typeof data.url === "string"
          )
            apiUrl = data.url;
        } catch {}
      }
    });
    await until(async () => Boolean(apiUrl));
    if (!apiUrl) throw new Error("No API URL");
    launch(["--import", "tsx", "apps/server/src/entrypoints/worker.ts"]);
    await until(async () => {
      try {
        return (await fetch(apiUrl + "/health/ready")).ok;
      } catch {
        return false;
      }
    });
    childEnv["VITE_PROXY_TARGET"] = apiUrl;
    launch(
      [
        path.join(projectRoot, "node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      path.join(projectRoot, "apps/web"),
    );
    await until(async () => {
      try {
        return (await fetch(base)).ok;
      } catch {
        return false;
      }
    });
    process.env["E2E_DATABASE_URL"] = url.toString();
    console.log(
      "Isolated E2E: fresh PostgreSQL database, real API/worker/Vite are ready; main demo data untouched.",
    );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
