import { setTimeout } from 'node:timers/promises';
import type { BusinessConfig } from '../config/business.js';
import type { Environment } from '../config/env.js';
import type { Database } from '../db/client.js';
import { runReservationJobs } from './reservations.js';

export async function runReservationWorker(database: Database, config: BusinessConfig, env: Environment, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const stats = await runReservationJobs(database, config, env.jobBatchSize);
      if (stats.expired || stats.warnings || stats.cancelled) console.log(JSON.stringify({ event: 'reservation-jobs', ...stats }));
    } catch {
      // No heartbeat on failure; API readiness will report the stale worker.
      console.error('Reservation job cycle failed; will retry. Check PostgreSQL and migrations.');
    }
    try { await setTimeout(env.jobPollMs, undefined, { signal }); }
    catch (error) { if (!signal.aborted) throw error; }
  }
}
