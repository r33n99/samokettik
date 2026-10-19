import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { Value } from '@sinclair/typebox/value';
import { StoredReservationResultSchema, type Reservation, type StoredReservationResult } from '@samokettik/contracts';
import type { BusinessConfig } from '../../config/business.js';
import { databaseTimeouts, type Database } from '../../db/client.js';
import { idempotencyRequests, notifications, rentals, users, vehicles } from '../../db/schema.js';

type Transaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0];
type Rental = typeof rentals.$inferSelect;
type Vehicle = typeof vehicles.$inferSelect;
type NotificationCode = typeof notifications.$inferInsert.code;
export type ReconcileStats = { warnings: number; expired: number; cancelled: number };
const emptyStats = (): ReconcileStats => ({ warnings: 0, expired: 0, cancelled: 0 });

export class ReservationUnavailableError extends Error {
  constructor() { super('Reservation storage is temporarily unavailable'); }
}
class CleanupRequired extends Error {
  constructor(readonly rentalId: string) { super('Reconcile before acquiring another owner lock'); }
}

export function reservationDto(row: Rental): Reservation {
  return { id: row.id, vehicleId: row.vehicleId, state: row.state, reservedAt: row.reservedAt.toISOString(), warnAt: row.warnAt.toISOString(), expiresAt: row.expiresAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null, endReason: row.endReason };
}
const success = (row: Rental, status: 200 | 201 = 200): StoredReservationResult => ({ status, body: { reservation: reservationDto(row) } });
const failure = (code: string, message: string, status: 404 | 409 = 409): StoredReservationResult => ({ status, body: { code, message } });

export async function databaseNow(tx: Transaction): Promise<Date> {
  // Drizzle raw execute intentionally returns timestamptz strings. Read integer
  // epoch milliseconds instead of relying on driver-specific date parsing.
  const result = await tx.execute<{ epoch_ms: string }>(sql`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS epoch_ms`);
  const milliseconds = Number(result.rows[0]?.epoch_ms);
  if (!Number.isSafeInteger(milliseconds)) throw new ReservationUnavailableError();
  return new Date(milliseconds);
}
async function lockSettings(tx: Transaction): Promise<void> {
  await tx.execute(sql`SELECT set_config('lock_timeout', ${`${databaseTimeouts.lockMs}ms`}, true)`);
}
async function notify(tx: Transaction, rental: Rental, code: NotificationCode, time: Date): Promise<number> {
  const inserted = await tx.insert(notifications).values({ userId: rental.userId, rentalId: rental.id, code, expiresAt: rental.expiresAt, createdAt: time }).onConflictDoNothing().returning({ id: notifications.id });
  return inserted.length;
}
async function closeRental(tx: Transaction, rental: Rental, state: 'expired' | 'cancelled', endedAt: Date, endReason: NonNullable<Rental['endReason']>): Promise<Rental> {
  // Copy the stored deadline in SQL: PostgreSQL may retain microseconds that a
  // JavaScript Date cannot represent (e.g. an existing/imported reservation).
  const [updated] = await tx.update(rentals).set({ state, endedAt: state === 'expired' ? sql`${rentals.expiresAt}` : endedAt, endReason }).where(and(eq(rentals.id, rental.id), eq(rentals.state, 'reserved'))).returning();
  if (!updated) throw new ReservationUnavailableError();
  return updated;
}

async function reconcileLocked(tx: Transaction, rental: Rental, vehicle: Vehicle, time: Date): Promise<ReconcileStats> {
  const stats = emptyStats();
  if (rental.state !== 'reserved') return stats;
  if (time < rental.reservedAt) throw new ReservationUnavailableError();
  if (time >= rental.expiresAt) {
    await closeRental(tx, rental, 'expired', rental.expiresAt, 'reservation_expired');
    await notify(tx, rental, 'RESERVATION_EXPIRED', time);
    stats.expired = 1;
  } else if (vehicle.batteryBp < rental.minimumBatteryBp || vehicle.serviceMode !== 'operational') {
    await closeRental(tx, rental, 'cancelled', time, vehicle.batteryBp < rental.minimumBatteryBp ? 'battery_too_low' : 'vehicle_unavailable');
    await notify(tx, rental, 'RESERVATION_UNAVAILABLE', time);
    stats.cancelled = 1;
  } else if (time >= rental.warnAt) {
    stats.warnings = await notify(tx, rental, 'RESERVATION_EXPIRING', time);
  }
  return stats;
}

// Used by all workers and lazy expiry. Never lock rental before its owner/vehicle.
export async function reconcileReservation(database: Database, id: string): Promise<ReconcileStats> {
  const [candidate] = await database.db.select().from(rentals).where(eq(rentals.id, id));
  if (!candidate || candidate.state !== 'reserved') return emptyStats();
  return database.db.transaction(async tx => {
    await lockSettings(tx);
    await tx.select({ id: users.id }).from(users).where(eq(users.id, candidate.userId)).for('update');
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, candidate.vehicleId)).for('update');
    const [rental] = await tx.select().from(rentals).where(eq(rentals.id, id)).for('update');
    if (!rental || !vehicle || rental.userId !== candidate.userId || rental.vehicleId !== candidate.vehicleId) return emptyStats();
    return reconcileLocked(tx, rental, vehicle, await databaseNow(tx));
  }, { isolationLevel: 'read committed' });
}

function errorField(error: unknown, field: 'code' | 'constraint'): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    if (field in current && typeof Reflect.get(current, field) === 'string') return String(Reflect.get(current, field));
    current = 'cause' in current ? Reflect.get(current, 'cause') : undefined;
  }
  return undefined;
}

async function command(database: Database, userId: string, key: string, operation: string, payload: object, perform: (tx: Transaction) => Promise<StoredReservationResult>): Promise<StoredReservationResult> {
  const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await database.db.transaction(async tx => {
        await lockSettings(tx);
        // Advisory lock comes before user lock. Insert the FK-bearing cache row only
        // after the owner is locked, avoiding FK key-share -> FOR UPDATE upgrade races.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`reservations:${userId}:${key}`}, 0))`);
        const [cached] = await tx.select().from(idempotencyRequests).where(and(eq(idempotencyRequests.userId, userId), eq(idempotencyRequests.key, key)));
        if (cached) {
          if (cached.operation !== operation || cached.requestHash !== requestHash) return failure('IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого запроса');
          if (!Value.Check(StoredReservationResultSchema, cached.result)) throw new ReservationUnavailableError();
          return cached.result;
        }
        const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
        if (!owner) return failure('USER_NOT_FOUND', 'Пользователь не найден', 404);
        const result = await perform(tx);
        await tx.insert(idempotencyRequests).values({ userId, key, operation, requestHash, result });
        return result;
      }, { isolationLevel: 'read committed' });
    } catch (error) {
      if (error instanceof CleanupRequired) {
        await reconcileReservation(database, error.rentalId);
        continue;
      }
      const code = errorField(error, 'code');
      if (code === '23505' && errorField(error, 'constraint') === 'rentals_one_active_user') return failure('ACTIVE_RENTAL_EXISTS', 'У вас уже есть активная бронь');
      if (code === '23505' && errorField(error, 'constraint') === 'rentals_one_active_vehicle') return failure('VEHICLE_NOT_AVAILABLE', 'Этот самокат уже забронирован');
      if (['40001', '40P01'].includes(code ?? '') && attempt < 2) continue;
      if (error instanceof ReservationUnavailableError) throw error;
      if (code && (code.startsWith('08') || ['55P03', '57014', '57P01', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code))) throw new ReservationUnavailableError();
      throw error;
    }
  }
  throw new ReservationUnavailableError();
}

export function reserveVehicle(database: Database, config: BusinessConfig, userId: string, key: string, vehicleId: string): Promise<StoredReservationResult> {
  return command(database, userId, key, 'reserve', { vehicleId }, async tx => {
    const [own] = await tx.select().from(rentals).where(and(eq(rentals.userId, userId), eq(rentals.state, 'reserved')));
    if (own) {
      if (own.expiresAt <= await databaseNow(tx)) throw new CleanupRequired(own.id);
      return failure('ACTIVE_RENTAL_EXISTS', 'У вас уже есть активная бронь');
    }
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
    if (!vehicle) return failure('VEHICLE_NOT_FOUND', 'Самокат не найден', 404);
    const time = await databaseNow(tx);
    const [occupied] = await tx.select().from(rentals).where(and(eq(rentals.vehicleId, vehicleId), eq(rentals.state, 'reserved'))).for('update');
    if (occupied) {
      if (occupied.expiresAt <= time || vehicle.batteryBp < occupied.minimumBatteryBp || vehicle.serviceMode !== 'operational') throw new CleanupRequired(occupied.id);
      return failure('VEHICLE_NOT_AVAILABLE', 'Этот самокат уже забронирован');
    }
    if (vehicle.serviceMode !== 'operational') return failure('VEHICLE_UNAVAILABLE', 'Самокат временно недоступен');
    if (vehicle.batteryBp < config.minRentalBatteryBp) return failure('BATTERY_TOO_LOW', 'Заряда недостаточно для бронирования');
    const expiresAt = new Date(time.getTime() + config.reservationDurationSeconds * 1000);
    const [rental] = await tx.insert(rentals).values({ userId, vehicleId, reservedAt: time, warnAt: new Date(expiresAt.getTime() - config.reservationWarningBeforeSeconds * 1000), expiresAt, minimumBatteryBp: config.minRentalBatteryBp }).returning();
    if (!rental) throw new ReservationUnavailableError();
    return success(rental, 201);
  });
}

export function cancelReservation(database: Database, userId: string, key: string, rentalId: string): Promise<StoredReservationResult> {
  return command(database, userId, key, 'cancel', { rentalId }, async tx => {
    const [candidate] = await tx.select().from(rentals).where(and(eq(rentals.id, rentalId), eq(rentals.userId, userId)));
    if (!candidate) return failure('RESERVATION_NOT_FOUND', 'Бронь не найдена', 404);
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.id, candidate.vehicleId)).for('update');
    const [rental] = await tx.select().from(rentals).where(and(eq(rentals.id, rentalId), eq(rentals.userId, userId))).for('update');
    if (!rental || !vehicle) return failure('RESERVATION_NOT_FOUND', 'Бронь не найдена', 404);
    if (rental.state === 'cancelled') return success(rental);
    const time = await databaseNow(tx);
    if (time < rental.reservedAt) throw new ReservationUnavailableError();
    if (rental.state === 'expired' || time >= rental.expiresAt) {
      await reconcileLocked(tx, rental, vehicle, time);
      return failure('RESERVATION_EXPIRED', 'Срок бронирования уже истёк');
    }
    return success(await closeRental(tx, rental, 'cancelled', time, 'cancelled_by_user'));
  });
}
