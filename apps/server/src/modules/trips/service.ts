import { and, eq, isNull } from 'drizzle-orm';
import type { StoredCommandResult } from '@samokettik/contracts';
import type { BusinessConfig } from '../../config/business.js';
import type { Database } from '../../db/client.js';
import { invoices, rentals, tripIntervals, vehicles } from '../../db/schema.js';
import { databaseNow, failure, reconcileLocked, rentalCommand, ReservationUnavailableError, type Transaction } from '../reservations/service.js';
import { calculateFare, sumIntervals } from './billing.js';
import { isWithinZone } from './geofence.js';
import { tripResult } from './view.js';

async function lockRental(tx: Transaction, userId: string, rentalId: string) {
  const [candidate] = await tx.select().from(rentals).where(and(eq(rentals.id, rentalId), eq(rentals.userId, userId)));
  if (!candidate) return null;
  const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, candidate.vehicleId)).for('update');
  const [rental] = await tx.select().from(rentals).where(and(eq(rentals.id, rentalId), eq(rentals.userId, userId))).for('update');
  return vehicle && rental ? { vehicle, rental } : null;
}

export function startTrip(database: Database, config: BusinessConfig, userId: string, key: string, rentalId: string): Promise<StoredCommandResult> {
  return rentalCommand(database, userId, key, 'trip-start', { rentalId }, async tx => {
    const locked = await lockRental(tx, userId, rentalId);
    if (!locked) return failure('RESERVATION_NOT_FOUND', 'Бронь не найдена', 404);
    const { rental, vehicle } = locked;
    const time = await databaseNow(tx);
    if (rental.state === 'expired') return failure('RESERVATION_EXPIRED', 'Срок бронирования уже истёк');
    if (rental.state !== 'reserved') return failure('INVALID_RENTAL_STATE', 'Начать поездку можно только из действующей брони');
    if (time < rental.reservedAt) throw new ReservationUnavailableError();
    if (time >= rental.expiresAt) {
      await reconcileLocked(tx, rental, vehicle, time);
      return failure('RESERVATION_EXPIRED', 'Срок бронирования уже истёк');
    }
    if (vehicle.batteryBp < rental.minimumBatteryBp || vehicle.serviceMode !== 'operational') {
      await reconcileLocked(tx, rental, vehicle, time);
      return failure('VEHICLE_UNAVAILABLE', 'Самокат больше недоступен для начала поездки');
    }
    if (!isWithinZone(config.serviceZone, vehicle.longitudeE7, vehicle.latitudeE7)) return failure('OUTSIDE_SERVICE_ZONE', 'Самокат находится вне зоны обслуживания');
    const [updated] = await tx.update(rentals).set({ state: 'riding', startedAt: time, rideRateMinorPerMinute: config.rideRateMinorPerMinute, pauseRateMinorPerMinute: config.pauseRateMinorPerMinute, currency: config.currency, billingPolicy: config.billingPolicy, zoneSnapshot: config.serviceZone }).where(eq(rentals.id, rentalId)).returning();
    if (!updated) throw new ReservationUnavailableError();
    await tx.insert(tripIntervals).values({ rentalId, mode: 'riding', ordinal: 0, startedAt: time });
    return { status: 200, body: await tripResult(tx, updated, time) };
  });
}

export function transitionTrip(database: Database, userId: string, key: string, rentalId: string, action: 'pause' | 'resume' | 'finish'): Promise<StoredCommandResult> {
  return rentalCommand(database, userId, key, `trip-${action}`, { rentalId }, async tx => {
    const locked = await lockRental(tx, userId, rentalId);
    if (!locked) return failure('TRIP_NOT_FOUND', 'Поездка не найдена', 404);
    const { rental, vehicle } = locked;
    if (action === 'finish' && rental.state === 'finished') return { status: 200, body: await tripResult(tx, rental, rental.endedAt ?? await databaseNow(tx)) };
    if (rental.state !== 'riding' && rental.state !== 'paused') return failure('INVALID_RENTAL_STATE', 'Операция доступна только во время поездки');
    if ((action === 'pause' && rental.state !== 'riding') || (action === 'resume' && rental.state !== 'paused')) return failure('INVALID_RENTAL_STATE', action === 'pause' ? 'Поездка уже на паузе' : 'Поездка не на паузе');
    // Reading coordinates and all intervals under aggregate locks makes finish
    // atomic against pause/resume and future trusted telemetry updates.
    const intervals = await tx.select().from(tripIntervals).where(eq(tripIntervals.rentalId, rentalId)).orderBy(tripIntervals.ordinal).for('update');
    const open = intervals.at(-1);
    const time = await databaseNow(tx);
    if (!open || open.endedAt !== null || open.mode !== rental.state || time < open.startedAt) throw new ReservationUnavailableError();
    if (action === 'finish' && (!rental.zoneSnapshot || !isWithinZone(rental.zoneSnapshot, vehicle.longitudeE7, vehicle.latitudeE7))) return failure('OUTSIDE_SERVICE_ZONE', 'Завершить поездку вне зоны нельзя. Вернитесь в зону; поездка и тарификация продолжаются');
    if (!rental.startedAt || rental.rideRateMinorPerMinute === null || rental.pauseRateMinorPerMinute === null || !rental.currency || !rental.billingPolicy) throw new ReservationUnavailableError();
    const durations = sumIntervals(intervals, rental.startedAt, time);
    const fare = calculateFare(durations.activeMs, durations.pausedMs, rental.rideRateMinorPerMinute, rental.pauseRateMinorPerMinute);
    await tx.update(tripIntervals).set({ endedAt: time }).where(and(eq(tripIntervals.id, open.id), isNull(tripIntervals.endedAt)));
    if (action === 'finish') {
      const [updated] = await tx.update(rentals).set({ state: 'finished', endedAt: time, endReason: 'finished_by_user' }).where(eq(rentals.id, rentalId)).returning();
      if (!updated) throw new ReservationUnavailableError();
      await tx.insert(invoices).values({ rentalId, userId, currency: rental.currency, billingPolicy: rental.billingPolicy, rideRateMinorPerMinute: rental.rideRateMinorPerMinute, pauseRateMinorPerMinute: rental.pauseRateMinorPerMinute, ...fare, createdAt: time });
      return { status: 200, body: await tripResult(tx, updated, time) };
    }
    const state = action === 'pause' ? 'paused' : 'riding';
    await tx.insert(tripIntervals).values({ rentalId, mode: state, ordinal: open.ordinal + 1, startedAt: time });
    const [updated] = await tx.update(rentals).set({ state }).where(eq(rentals.id, rentalId)).returning();
    if (!updated) throw new ReservationUnavailableError();
    return { status: 200, body: await tripResult(tx, updated, time) };
  });
}
