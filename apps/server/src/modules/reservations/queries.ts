import { and, desc, eq, gt } from 'drizzle-orm';
import type { BusinessConfig } from '../../config/business.js';
import type { Database } from '../../db/client.js';
import { notifications, rentals, vehicles } from '../../db/schema.js';
import { databaseNow, reservationDto } from './service.js';

export async function listVehicles(database: Database, config: BusinessConfig) {
  return database.db.transaction(async tx => {
    const time = await databaseNow(tx);
    const rows = await tx.select({ vehicle: vehicles, reservationId: rentals.id }).from(vehicles)
      .leftJoin(rentals, and(eq(rentals.vehicleId, vehicles.id), eq(rentals.state, 'reserved'), gt(rentals.expiresAt, time))).orderBy(vehicles.publicCode);
    return { serverTime: time.toISOString(), items: rows.map(({ vehicle, reservationId }) => ({
      id: vehicle.id, publicCode: vehicle.publicCode, batteryBp: vehicle.batteryBp, latitude: vehicle.latitudeE7 / 1e7, longitude: vehicle.longitudeE7 / 1e7,
      status: reservationId ? 'reserved' as const : vehicle.serviceMode !== 'operational' || vehicle.batteryBp < config.minRentalBatteryBp ? 'unavailable' as const : 'available' as const,
      unavailableReason: reservationId ? null : vehicle.serviceMode !== 'operational' ? 'MAINTENANCE' as const : vehicle.batteryBp < config.minRentalBatteryBp ? 'BATTERY_TOO_LOW' as const : null,
    })) };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export async function currentReservation(database: Database, userId: string) {
  return database.db.transaction(async tx => {
    const time = await databaseNow(tx);
    const [rental] = await tx.select().from(rentals).where(and(eq(rentals.userId, userId), eq(rentals.state, 'reserved'), gt(rentals.expiresAt, time)));
    return { serverTime: time.toISOString(), reservation: rental ? reservationDto(rental) : null };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

const messages = { RESERVATION_EXPIRING: 'Срок бронирования скоро истечёт', RESERVATION_EXPIRED: 'Срок бронирования истёк', RESERVATION_UNAVAILABLE: 'Бронь отменена: самокат больше недоступен' } as const;
export async function listNotifications(database: Database, userId: string) {
  const rows = await database.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(100);
  return { items: rows.map(row => ({ id: row.id, rentalId: row.rentalId, code: row.code, message: messages[row.code], createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() })) };
}
