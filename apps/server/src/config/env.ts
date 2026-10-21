import { loadEnvFile } from "node:process";
import path from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { projectRoot } from "./paths.js";

const EnvSchema = Type.Object(
  {
    databaseUrl: Type.String({ minLength: 1 }),
    host: Type.String({ minLength: 1 }),
    port: Type.Integer({ minimum: 1, maximum: 65535 }),
    logLevel: Type.Union(
      (
        ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const
      ).map((value) => Type.Literal(value)),
    ),
    demoSeedEnabled: Type.Boolean(),
    demoAuthEnabled: Type.Boolean(),
    demoRuToken: Type.String(),
    demoKyToken: Type.String(),
    demoBrowserEnabled: Type.Boolean(),
    demoSessionSecret: Type.String(),
    demoSessionSeconds: Type.Integer({ minimum: 60, maximum: 86400 }),
    mapTileUrl: Type.String({ minLength: 1 }),
    jobPollMs: Type.Integer({ minimum: 100, maximum: 60000 }),
    jobBatchSize: Type.Integer({ minimum: 1, maximum: 200 }),
    workerStaleMs: Type.Integer({ minimum: 1000, maximum: 300000 }),
    wsAllowedOrigins: Type.Array(Type.String(), { minItems: 1 }),
    wsReconcileMs: Type.Integer({ minimum: 100, maximum: 60000 }),
    wsHeartbeatMs: Type.Integer({ minimum: 1000, maximum: 60000 }),
    wsTicketSeconds: Type.Integer({ minimum: 1, maximum: 120 }),
    wsMaxClients: Type.Integer({ minimum: 1, maximum: 1000 }),
    wsMaxBufferedBytes: Type.Integer({ minimum: 16384, maximum: 16777216 }),
  },
  { additionalProperties: false },
);
export type Environment = Static<typeof EnvSchema>;

export function parseEnvironment(values: NodeJS.ProcessEnv): Environment {
  const candidate = {
    databaseUrl: values["DATABASE_URL"] ?? "",
    host: values["API_HOST"] ?? "127.0.0.1",
    port: Number(values["API_PORT"] ?? "3001"),
    logLevel: values["API_LOG_LEVEL"] ?? "info",
    demoSeedEnabled: values["DEMO_SEED_ENABLED"] === "true",
    demoAuthEnabled: values["DEMO_AUTH_ENABLED"] === "true",
    demoRuToken: values["DEMO_USER_RU_TOKEN"] ?? "",
    demoKyToken: values["DEMO_USER_KY_TOKEN"] ?? "",
    demoBrowserEnabled: values["DEMO_BROWSER_ENABLED"] === "true",
    demoSessionSecret: values["DEMO_SESSION_SECRET"] ?? "",
    demoSessionSeconds: Number(values["DEMO_SESSION_SECONDS"] ?? "3600"),
    mapTileUrl:
      values["MAP_TILE_URL"] ??
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    jobPollMs: Number(values["BOOKING_JOB_POLL_MS"] ?? "1000"),
    jobBatchSize: Number(values["BOOKING_JOB_BATCH_SIZE"] ?? "50"),
    workerStaleMs: Number(values["BOOKING_WORKER_STALE_MS"] ?? "10000"),
    wsAllowedOrigins: (
      values["WS_ALLOWED_ORIGINS"] ??
      "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((value) => value.trim()),
    wsReconcileMs: Number(values["WS_RECONCILE_MS"] ?? "3000"),
    wsHeartbeatMs: Number(values["WS_HEARTBEAT_MS"] ?? "15000"),
    wsTicketSeconds: Number(values["WS_TICKET_SECONDS"] ?? "30"),
    wsMaxClients: Number(values["WS_MAX_CLIENTS"] ?? "100"),
    wsMaxBufferedBytes: Number(values["WS_MAX_BUFFERED_BYTES"] ?? "1048576"),
  };
  if (
    values["DEMO_SEED_ENABLED"] &&
    !["true", "false"].includes(values["DEMO_SEED_ENABLED"])
  ) {
    throw new Error("DEMO_SEED_ENABLED must be true or false");
  }
  if (
    values["DEMO_AUTH_ENABLED"] &&
    !["true", "false"].includes(values["DEMO_AUTH_ENABLED"])
  )
    throw new Error("DEMO_AUTH_ENABLED must be true or false");
  if (
    values["DEMO_BROWSER_ENABLED"] &&
    !["true", "false"].includes(values["DEMO_BROWSER_ENABLED"])
  )
    throw new Error("DEMO_BROWSER_ENABLED must be true or false");
  if (!Value.Check(EnvSchema, candidate)) {
    const fields = [...Value.Errors(EnvSchema, candidate)]
      .map((error) => error.path)
      .join(", ");
    throw new Error(`Invalid environment fields: ${fields}. See .env.example`);
  }
  if (
    candidate.demoAuthEnabled &&
    (candidate.demoRuToken.length < 32 ||
      candidate.demoKyToken.length < 32 ||
      candidate.demoRuToken === candidate.demoKyToken)
  )
    throw new Error(
      "Demo auth requires two different secret tokens of at least 32 characters",
    );
  if (
    candidate.demoBrowserEnabled &&
    (!candidate.demoAuthEnabled ||
      candidate.demoSessionSecret.length < 32 ||
      candidate.demoSessionSecret.startsWith("replace-"))
  )
    throw new Error(
      "Demo browser requires enabled demo auth and a generated session secret",
    );
  if (
    !candidate.mapTileUrl.startsWith("https://") ||
    !["{z}", "{x}", "{y}"].every((part) => candidate.mapTileUrl.includes(part))
  )
    throw new Error("MAP_TILE_URL must be an HTTPS tile template");
  if (candidate.workerStaleMs < candidate.jobPollMs * 2)
    throw new Error(
      "BOOKING_WORKER_STALE_MS must allow at least two polling intervals",
    );
  for (const origin of candidate.wsAllowedOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("WS_ALLOWED_ORIGINS must contain HTTP origins");
    }
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    )
      throw new Error("WS_ALLOWED_ORIGINS must contain exact HTTP origins");
  }
  let url: URL;
  try {
    url = new URL(candidate.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  ) {
    throw new Error("DATABASE_URL must name a PostgreSQL host and database");
  }
  return candidate;
}

export function loadEnvironment(): Environment {
  try {
    loadEnvFile(path.join(projectRoot, ".env"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  return parseEnvironment(process.env);
}
