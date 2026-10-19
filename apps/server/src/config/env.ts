import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { projectRoot } from './paths.js';

const EnvSchema = Type.Object({
  databaseUrl: Type.String({ minLength: 1 }),
  host: Type.String({ minLength: 1 }),
  port: Type.Integer({ minimum: 1, maximum: 65535 }),
  logLevel: Type.Union((['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const).map(value => Type.Literal(value))),
  demoSeedEnabled: Type.Boolean(),
  demoAuthEnabled: Type.Boolean(),
  demoRuToken: Type.String(),
  demoKyToken: Type.String(),
  jobPollMs: Type.Integer({ minimum: 100, maximum: 60000 }),
  jobBatchSize: Type.Integer({ minimum: 1, maximum: 200 }),
  workerStaleMs: Type.Integer({ minimum: 1000, maximum: 300000 }),
}, { additionalProperties: false });
export type Environment = Static<typeof EnvSchema>;

export function parseEnvironment(values: NodeJS.ProcessEnv): Environment {
  const candidate = {
    databaseUrl: values['DATABASE_URL'] ?? '',
    host: values['API_HOST'] ?? '127.0.0.1',
    port: Number(values['API_PORT'] ?? '3001'),
    logLevel: values['API_LOG_LEVEL'] ?? 'info',
    demoSeedEnabled: values['DEMO_SEED_ENABLED'] === 'true',
    demoAuthEnabled: values['DEMO_AUTH_ENABLED'] === 'true',
    demoRuToken: values['DEMO_USER_RU_TOKEN'] ?? '',
    demoKyToken: values['DEMO_USER_KY_TOKEN'] ?? '',
    jobPollMs: Number(values['BOOKING_JOB_POLL_MS'] ?? '1000'),
    jobBatchSize: Number(values['BOOKING_JOB_BATCH_SIZE'] ?? '50'),
    workerStaleMs: Number(values['BOOKING_WORKER_STALE_MS'] ?? '10000'),
  };
  if (values['DEMO_SEED_ENABLED'] && !['true', 'false'].includes(values['DEMO_SEED_ENABLED'])) {
    throw new Error('DEMO_SEED_ENABLED must be true or false');
  }
  if (values['DEMO_AUTH_ENABLED'] && !['true', 'false'].includes(values['DEMO_AUTH_ENABLED'])) throw new Error('DEMO_AUTH_ENABLED must be true or false');
  if (!Value.Check(EnvSchema, candidate)) {
    const fields = [...Value.Errors(EnvSchema, candidate)].map(error => error.path).join(', ');
    throw new Error(`Invalid environment fields: ${fields}. See .env.example`);
  }
  if (candidate.demoAuthEnabled && (candidate.demoRuToken.length < 32 || candidate.demoKyToken.length < 32 || candidate.demoRuToken === candidate.demoKyToken)) throw new Error('Demo auth requires two different secret tokens of at least 32 characters');
  if (candidate.workerStaleMs < candidate.jobPollMs * 2) throw new Error('BOOKING_WORKER_STALE_MS must allow at least two polling intervals');
  let url: URL;
  try { url = new URL(candidate.databaseUrl); }
  catch { throw new Error('DATABASE_URL must be a PostgreSQL connection URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('DATABASE_URL must name a PostgreSQL host and database');
  }
  return candidate;
}

export function loadEnvironment(): Environment {
  try { loadEnvFile(path.join(projectRoot, '.env')); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  return parseEnvironment(process.env);
}
