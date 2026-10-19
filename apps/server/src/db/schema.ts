import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { StoredReservationResult } from '@samokettik/contracts';

export const appMetadata = pgTable('app_metadata', {
  id: integer('id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
}, table => [check('app_metadata_singleton', sql`${table.id} = 1`), check('app_metadata_version_positive', sql`${table.schemaVersion} > 0`)]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  emailNormalized: varchar('email_normalized', { length: 254 }).notNull().unique(),
  passwordHash: text('password_hash'),
  locale: varchar('locale', { length: 2 }).notNull().default('ru'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  check('users_email_normalized', sql`${table.emailNormalized} = lower(trim(${table.emailNormalized})) AND length(${table.emailNormalized}) > 3`),
  check('users_locale_supported', sql`${table.locale} IN ('ru', 'ky')`),
]);

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  publicCode: varchar('public_code', { length: 16 }).notNull().unique(),
  serviceMode: varchar('service_mode', { length: 16 }).$type<'operational' | 'maintenance'>().notNull().default('operational'),
  batteryBp: integer('battery_bp').notNull(),
  latitudeE7: integer('latitude_e7').notNull(),
  longitudeE7: integer('longitude_e7').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  check('vehicles_battery_range', sql`${table.batteryBp} BETWEEN 0 AND 10000`),
  check('vehicles_latitude_range', sql`${table.latitudeE7} BETWEEN -900000000 AND 900000000`),
  check('vehicles_longitude_range', sql`${table.longitudeE7} BETWEEN -1800000000 AND 1800000000`),
  check('vehicles_service_mode', sql`${table.serviceMode} IN ('operational', 'maintenance')`),
  check('vehicles_version_positive', sql`${table.version} > 0`),
]);

export const rentals = pgTable('rentals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'restrict' }),
  state: varchar('state', { length: 16 }).$type<'reserved' | 'cancelled' | 'expired'>().notNull().default('reserved'),
  reservedAt: timestamp('reserved_at', { withTimezone: true, mode: 'date' }).notNull(),
  warnAt: timestamp('warn_at', { withTimezone: true, mode: 'date' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  endReason: varchar('end_reason', { length: 32 }).$type<'cancelled_by_user' | 'reservation_expired' | 'battery_too_low' | 'vehicle_unavailable'>(),
  minimumBatteryBp: integer('minimum_battery_bp').notNull(),
}, table => [
  uniqueIndex('rentals_one_active_vehicle').on(table.vehicleId).where(sql`${table.state} = 'reserved'`),
  uniqueIndex('rentals_one_active_user').on(table.userId).where(sql`${table.state} = 'reserved'`),
  unique('rentals_id_owner').on(table.id, table.userId),
  index('rentals_expiry_due').on(table.expiresAt).where(sql`${table.state} = 'reserved'`),
  index('rentals_warning_due').on(table.warnAt).where(sql`${table.state} = 'reserved'`),
  index('rentals_user_history').on(table.userId, table.reservedAt),
  index('rentals_vehicle_history').on(table.vehicleId),
  check('rentals_state_supported', sql`${table.state} IN ('reserved', 'cancelled', 'expired')`),
  check('rentals_deadlines', sql`${table.reservedAt} < ${table.warnAt} AND ${table.warnAt} < ${table.expiresAt}`),
  check('rentals_minimum_battery', sql`${table.minimumBatteryBp} BETWEEN 0 AND 10000`),
  check('rentals_terminal_state', sql`(
    (${table.state} = 'reserved' AND ${table.endedAt} IS NULL AND ${table.endReason} IS NULL) OR
    (${table.state} = 'expired' AND ${table.endedAt} IS NOT NULL AND ${table.endReason} IS NOT NULL AND ${table.endedAt} = ${table.expiresAt} AND ${table.endReason} = 'reservation_expired') OR
    (${table.state} = 'cancelled' AND ${table.endedAt} IS NOT NULL AND ${table.endedAt} >= ${table.reservedAt}
      AND ${table.endReason} IS NOT NULL AND ${table.endReason} IN ('cancelled_by_user', 'battery_too_low', 'vehicle_unavailable'))
  )`),
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rentalId: uuid('rental_id').notNull().references(() => rentals.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 40 }).$type<'RESERVATION_EXPIRING' | 'RESERVATION_EXPIRED' | 'RESERVATION_UNAVAILABLE'>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
}, table => [
  foreignKey({ name: 'notifications_rental_owner_fk', columns: [table.rentalId, table.userId], foreignColumns: [rentals.id, rentals.userId] }).onDelete('restrict'),
  unique('notifications_one_logical_event').on(table.rentalId, table.code),
  index('notifications_owner_created').on(table.userId, table.createdAt),
  check('notifications_code_supported', sql`${table.code} IN ('RESERVATION_EXPIRING', 'RESERVATION_EXPIRED', 'RESERVATION_UNAVAILABLE')`),
]);

export const idempotencyRequests = pgTable('idempotency_requests', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  key: uuid('key').notNull(),
  operation: varchar('operation', { length: 32 }).notNull(),
  requestHash: varchar('request_hash', { length: 64 }).notNull(),
  result: jsonb('result').$type<StoredReservationResult>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.key] })]);

export const jobHeartbeats = pgTable('job_heartbeats', {
  name: varchar('name', { length: 64 }).primaryKey(),
  configHash: varchar('config_hash', { length: 64 }).notNull(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }).notNull(),
});
