import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import type { BusinessConfig } from '../../config/business.js';
import type { Database } from '../../db/client.js';
import { notifications, rentals, vehicles } from '../../db/schema.js';
import { databaseNow, reservationDto, type Transaction } from './service.js';
import { tripResult } from '../trips/view.js';
import { hasMinimumBattery } from '../simulation/battery.js';

export async function fleetSnapshot(tx: Transaction, config: BusinessConfig, time: Date) {
    const rows = await tx.select({ vehicle: vehicles, rentalState: rentals.state }).from(vehicles)
      .leftJoin(rentals, and(eq(rentals.vehicleId, vehicles.id), or(inArray(rentals.state, ['riding', 'paused']), and(eq(rentals.state, 'reserved'), gt(rentals.expiresAt, time))))).orderBy(vehicles.publicCode);
    return { serverTime: time.toISOString(), items: rows.map(({ vehicle, rentalState }) => ({
      id: vehicle.id, publicCode: vehicle.publicCode, batteryBp: vehicle.batteryBp, latitude: vehicle.latitudeE7 / 1e7, longitude: vehicle.longitudeE7 / 1e7,
      status: rentalState === 'riding' || rentalState === 'paused' ? 'in_ride' as const : rentalState === 'reserved' ? 'reserved' as const : vehicle.serviceMode !== 'operational' || !hasMinimumBattery(vehicle, config.minRentalBatteryBp) ? 'unavailable' as const : 'available' as const,
      unavailableReason: rentalState ? null : vehicle.serviceMode !== 'operational' ? 'MAINTENANCE' as const : !hasMinimumBattery(vehicle, config.minRentalBatteryBp) ? 'BATTERY_TOO_LOW' as const : null,
    })) };
}
export async function listVehicles(database: Database, config: BusinessConfig) {
  return database.db.transaction(async tx => fleetSnapshot(tx, config, await databaseNow(tx)), { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function currentSnapshot(tx: Transaction, userId: string, time: Date) {
    const [rental] = await tx.select().from(rentals).where(and(eq(rentals.userId, userId), or(inArray(rentals.state, ['riding', 'paused']), and(eq(rentals.state, 'reserved'), gt(rentals.expiresAt, time)))));
    return { serverTime: time.toISOString(), reservation: rental?.state === 'reserved' ? reservationDto(rental) : null, trip: rental && rental.state !== 'reserved' ? (await tripResult(tx, rental, time)).trip : null };
}
export async function currentReservation(database: Database, userId: string) {
  return database.db.transaction(async tx => currentSnapshot(tx, userId, await databaseNow(tx)), { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

const messages = { RESERVATION_EXPIRING: 'Срок бронирования скоро истечёт', RESERVATION_EXPIRED: 'Срок бронирования истёк', RESERVATION_UNAVAILABLE: 'Бронь отменена: самокат больше недоступен', TRIP_FINISHED: 'Поездка завершена, счёт выставлен' } as const;
export async function notificationSnapshot(tx: Transaction, userId: string) {
  const rows = await tx.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(100);
  return { items: rows.map(row => ({ id: row.id, rentalId: row.rentalId, code: row.code, message: row.reason === 'battery_depleted' ? 'Поездка автоматически завершена: аккумулятор разряжен. Счёт выставлен' : messages[row.code], reason: row.reason, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null })) };
}
export async function listNotifications(database: Database, userId: string) {
  return database.db.transaction(tx => notificationSnapshot(tx, userId), { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
