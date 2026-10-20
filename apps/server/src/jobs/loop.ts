import { setTimeout } from 'node:timers/promises';
import type { BusinessConfig } from '../config/business.js';
import type { Environment } from '../config/env.js';
import type { Database } from '../db/client.js';
import { runBackgroundJobs } from './transport.js';

export async function runReservationWorker(database: Database, config: BusinessConfig, env: Environment, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const stats = await runBackgroundJobs(database, config, env.jobBatchSize);
      if (stats.expired || stats.warnings || stats.cancelled || stats.processed || stats.delivered) console.log(JSON.stringify({ event: 'background-jobs', ...stats }));
    } catch {
      // No heartbeat on failure; API readiness will report the stale worker.
      console.error('Background job cycle failed; will retry. Check PostgreSQL and migrations.');
    }
    try { await setTimeout(env.jobPollMs, undefined, { signal }); }
    catch (error) { if (!signal.aborted) throw error; }
  }
}
