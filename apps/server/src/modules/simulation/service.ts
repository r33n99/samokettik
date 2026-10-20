import { eq, sql } from 'drizzle-orm';
import type { BusinessConfig } from '../../config/business.js';
import { rentals, tripIntervals, tripSimulations, vehicles } from '../../db/schema.js';
import { ReservationUnavailableError, type Transaction } from '../reservations/service.js';
import { finishLockedTrip } from '../trips/finalize.js';
import { advanceSimulation, buildRoute, positionAt } from './model.js';

type Rental = typeof rentals.$inferSelect;
type Vehicle = typeof vehicles.$inferSelect;
export async function beginSimulation(tx: Transaction, rental: Rental, vehicle: Vehicle, time: Date, config: BusinessConfig) {
  const [inserted] = await tx.insert(tripSimulations).values({ rentalId: rental.id, lastAt: time, rideDrainBpPerMinute: config.rideDrainBpPerMinute, pauseDrainBpPerMinute: config.pauseDrainBpPerMinute, speedMmPerMinute: config.simulationSpeedMetersPerMinute * 1000, tickMs: config.simulationTickMs, route: buildRoute(vehicle.longitudeE7, vehicle.latitudeE7, config.simulationRouteSideE7) }).returning();
  if (!inserted) throw new ReservationUnavailableError();
  return inserted;
}
export async function advanceLockedTrip(tx: Transaction, rental: Rental, vehicle: Vehicle, intervals: typeof tripIntervals.$inferSelect[], time: Date, config: BusinessConfig) {
  if (rental.state !== 'riding' && rental.state !== 'paused') return { rental, vehicle };
  let [simulation] = await tx.select().from(tripSimulations).where(eq(tripSimulations.rentalId, rental.id)).for('update');
  // Existing rides from schema v3 start simulation when first observed. Do not
  // invent historical battery consumption for a feature that did not exist.
  simulation ??= await beginSimulation(tx, rental, vehicle, time, config);
  const open = intervals.at(-1);
  if (!open || simulation.lastAt < open.startedAt || time < simulation.lastAt) throw new ReservationUnavailableError();
  const next = advanceSimulation({ ...simulation, batteryRemainder: vehicle.batteryRemainder }, vehicle.batteryBp, rental.state, time);
  let updatedVehicle = vehicle;
  const position = next.distanceMm !== simulation.distanceMm ? positionAt(simulation.route, next.distanceMm) : { longitudeE7: vehicle.longitudeE7, latitudeE7: vehicle.latitudeE7 };
  if (next.batteryBp !== vehicle.batteryBp || next.batteryRemainder !== vehicle.batteryRemainder || position.latitudeE7 !== vehicle.latitudeE7 || position.longitudeE7 !== vehicle.longitudeE7) {
    const [updated] = await tx.update(vehicles).set({ ...position, batteryBp: next.batteryBp, batteryRemainder: next.batteryRemainder, version: sql`${vehicles.version} + 1` }).where(eq(vehicles.id, vehicle.id)).returning();
    if (!updated) throw new ReservationUnavailableError();
    updatedVehicle = updated;
  }
  await tx.update(tripSimulations).set({ lastAt: next.lastAt, distanceMm: next.distanceMm, distanceRemainder: next.distanceRemainder }).where(eq(tripSimulations.rentalId, rental.id));
  if (next.depletionAt) return { rental: await finishLockedTrip(tx, rental, intervals, next.depletionAt, 'battery_depleted', time), vehicle: updatedVehicle };
  return { rental, vehicle: updatedVehicle };
}
