import { and, eq, sql } from 'drizzle-orm';
import { configHash, type BusinessConfig } from '../config/business.js';
import type { Database } from '../db/client.js';
import { jobHeartbeats, rentals, vehicles } from '../db/schema.js';
import { reconcileReservation, type ReconcileStats } from '../modules/reservations/service.js';
export const RESERVATION_JOB = 'reservation-deadlines';

export async function recordReservationHeartbeat(database: Database, config: BusinessConfig): Promise<void> {
  await database.db.insert(jobHeartbeats).values({ name: RESERVATION_JOB, configHash: configHash(config), lastSuccessAt: sql`clock_timestamp()` })
    .onConflictDoUpdate({ target: jobHeartbeats.name, set: { configHash: configHash(config), lastSuccessAt: sql`clock_timestamp()` } });
}
export async function reservationWorkerHealthy(database: Database, config: BusinessConfig, staleMs: number): Promise<boolean> {
  const [row] = await database.db.select({ name: jobHeartbeats.name }).from(jobHeartbeats).where(and(
    eq(jobHeartbeats.name, RESERVATION_JOB), eq(jobHeartbeats.configHash, configHash(config)),
    sql`${jobHeartbeats.lastSuccessAt} >= clock_timestamp() - ${staleMs} * interval '1 millisecond'`,
  ));
  return Boolean(row);
}

// No timer per reservation: discover persistent due rows after every restart.
export async function runReservationJobs(database: Database, config: BusinessConfig, batchSize: number): Promise<ReconcileStats> {
  const candidates = await database.db.select({ id: rentals.id }).from(rentals).innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId)).where(and(
    eq(rentals.state, 'reserved'),
    sql`(${rentals.expiresAt} <= clock_timestamp()
      OR (${rentals.warnAt} <= clock_timestamp() AND NOT EXISTS (
        SELECT 1 FROM notifications n WHERE n.rental_id = ${rentals.id} AND n.code = 'RESERVATION_EXPIRING'
      )) OR ${vehicles.batteryBp} < ${rentals.minimumBatteryBp} OR (${vehicles.batteryBp} = ${rentals.minimumBatteryBp} AND ${vehicles.batteryRemainder} > 0) OR ${vehicles.serviceMode} <> 'operational')`,
  )).orderBy(rentals.expiresAt, rentals.id).limit(batchSize);
  const totals: ReconcileStats = { warnings: 0, expired: 0, cancelled: 0 };
  for (const candidate of candidates) {
    const stats = await reconcileReservation(database, candidate.id);
    totals.warnings += stats.warnings;
    totals.expired += stats.expired;
    totals.cancelled += stats.cancelled;
  }
  await recordReservationHeartbeat(database, config);
  return totals;
}
