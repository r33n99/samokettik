import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { BusinessConfig } from '../config/business.js';
import { configHash } from '../config/business.js';
import { databaseTimeouts, type Database } from '../db/client.js';
import { jobHeartbeats, realtimeTickets, rentals, tripIntervals, tripSimulations, users, vehicles } from '../db/schema.js';
import { databaseNow } from '../modules/reservations/service.js';
import { lockRental } from '../modules/trips/service.js';
import { advanceLockedTrip } from '../modules/simulation/service.js';
import { deliverLocalMail } from './mail.js';
import { runReservationJobs } from './reservations.js';
export const TRANSPORT_JOB = 'transport-background';

export async function recordTransportHeartbeat(database: Database, config: BusinessConfig) {
  await database.db.insert(jobHeartbeats).values({ name: TRANSPORT_JOB, configHash: configHash(config), lastSuccessAt: sql`clock_timestamp()` })
    .onConflictDoUpdate({ target: jobHeartbeats.name, set: { configHash: configHash(config), lastSuccessAt: sql`clock_timestamp()` } });
}
export async function transportWorkerHealthy(database: Database, config: BusinessConfig, staleMs: number): Promise<boolean> {
  const [row] = await database.db.select({ name: jobHeartbeats.name }).from(jobHeartbeats).where(and(eq(jobHeartbeats.name, TRANSPORT_JOB), eq(jobHeartbeats.configHash, configHash(config)), sql`${jobHeartbeats.lastSuccessAt} >= clock_timestamp() - ${staleMs} * interval '1 millisecond'`));
  return Boolean(row);
}
export async function runSimulationJobs(database: Database, config: BusinessConfig, batchSize: number) {
  const candidates = await database.db.select({ id: rentals.id, userId: rentals.userId }).from(rentals)
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId)).leftJoin(tripSimulations, eq(tripSimulations.rentalId, rentals.id))
    .where(and(inArray(rentals.state, ['riding', 'paused']), sql`(${tripSimulations.rentalId} IS NULL OR ${vehicles.batteryBp} = 0 OR ${tripSimulations.lastAt} + ${tripSimulations.tickMs} * interval '1 millisecond' <= clock_timestamp())`))
    .orderBy(sql`${tripSimulations.lastAt} ASC NULLS FIRST`, rentals.id).limit(batchSize);
  let processed = 0, depleted = 0;
  for (const candidate of candidates) {
    const result = await database.db.transaction(async tx => {
      await tx.execute(sql`SELECT set_config('lock_timeout', ${`${databaseTimeouts.lockMs}ms`}, true)`);
      await tx.select({ id: users.id }).from(users).where(eq(users.id, candidate.userId)).for('update');
      const locked = await lockRental(tx, candidate.userId, candidate.id);
      if (!locked || (locked.rental.state !== 'riding' && locked.rental.state !== 'paused')) return null;
      const intervals = await tx.select().from(tripIntervals).where(eq(tripIntervals.rentalId, candidate.id)).orderBy(tripIntervals.ordinal).for('update');
      const [simulation] = await tx.select().from(tripSimulations).where(eq(tripSimulations.rentalId, candidate.id));
      const time = await databaseNow(tx);
      if (simulation && locked.vehicle.batteryBp > 0 && simulation.lastAt.getTime() + simulation.tickMs > time.getTime()) return null;
      return advanceLockedTrip(tx, locked.rental, locked.vehicle, intervals, time, config);
    });
    if (result) { processed++; if (result.rental.state === 'finished') depleted++; }
  }
  return { processed, depleted };
}
export async function runBackgroundJobs(database: Database, config: BusinessConfig, batchSize: number) {
  const reservations = await runReservationJobs(database, config, batchSize);
  const simulation = await runSimulationJobs(database, config, batchSize);
  const delivered = await deliverLocalMail(database, batchSize);
  await database.db.delete(realtimeTickets).where(lt(realtimeTickets.expiresAt, sql`clock_timestamp()`));
  await recordTransportHeartbeat(database, config);
  return { ...reservations, ...simulation, delivered };
}
