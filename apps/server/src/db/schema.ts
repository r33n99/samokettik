import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ServiceZone, StoredCommandResult } from '@samokettik/contracts';
import type { SimulationRoute } from '../modules/simulation/model.js';

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
  batteryRemainder: integer('battery_remainder').notNull().default(0),
  latitudeE7: integer('latitude_e7').notNull(),
  longitudeE7: integer('longitude_e7').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [
  check('vehicles_battery_range', sql`${table.batteryBp} BETWEEN 0 AND 10000`),
  check('vehicles_battery_fraction', sql`${table.batteryRemainder} BETWEEN 0 AND 59999 AND (${table.batteryBp} > 0 OR ${table.batteryRemainder} = 0)`),
  check('vehicles_latitude_range', sql`${table.latitudeE7} BETWEEN -900000000 AND 900000000`),
  check('vehicles_longitude_range', sql`${table.longitudeE7} BETWEEN -1800000000 AND 1800000000`),
  check('vehicles_service_mode', sql`${table.serviceMode} IN ('operational', 'maintenance')`),
  check('vehicles_version_positive', sql`${table.version} > 0`),
]);

export const rentals = pgTable('rentals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'restrict' }),
  state: varchar('state', { length: 16 }).$type<'reserved' | 'cancelled' | 'expired' | 'riding' | 'paused' | 'finished'>().notNull().default('reserved'),
  reservedAt: timestamp('reserved_at', { withTimezone: true, mode: 'date' }).notNull(),
  warnAt: timestamp('warn_at', { withTimezone: true, mode: 'date' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  endReason: varchar('end_reason', { length: 32 }).$type<'cancelled_by_user' | 'reservation_expired' | 'battery_too_low' | 'vehicle_unavailable' | 'finished_by_user' | 'battery_depleted'>(),
  minimumBatteryBp: integer('minimum_battery_bp').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
  rideRateMinorPerMinute: integer('ride_rate_minor_per_minute'),
  pauseRateMinorPerMinute: integer('pause_rate_minor_per_minute'),
  currency: varchar('currency', { length: 3 }).$type<'KGS'>(),
  billingPolicy: varchar('billing_policy', { length: 32 }).$type<'ceil-per-mode-v1'>(),
  zoneSnapshot: jsonb('zone_snapshot').$type<ServiceZone>(),
}, table => [
  uniqueIndex('rentals_one_active_vehicle').on(table.vehicleId).where(sql`${table.state} IN ('reserved', 'riding', 'paused')`),
  uniqueIndex('rentals_one_active_user').on(table.userId).where(sql`${table.state} IN ('reserved', 'riding', 'paused')`),
  unique('rentals_id_owner').on(table.id, table.userId),
  index('rentals_expiry_due').on(table.expiresAt).where(sql`${table.state} = 'reserved'`),
  index('rentals_warning_due').on(table.warnAt).where(sql`${table.state} = 'reserved'`),
  index('rentals_user_history').on(table.userId, table.reservedAt),
  index('rentals_vehicle_history').on(table.vehicleId),
  check('rentals_state_supported', sql`${table.state} IN ('reserved', 'cancelled', 'expired', 'riding', 'paused', 'finished')`),
  check('rentals_deadlines', sql`${table.reservedAt} < ${table.warnAt} AND ${table.warnAt} < ${table.expiresAt}`),
  check('rentals_minimum_battery', sql`${table.minimumBatteryBp} BETWEEN 0 AND 10000`),
  check('rentals_terminal_state', sql`(
    (${table.state} IN ('reserved', 'riding', 'paused') AND ${table.endedAt} IS NULL AND ${table.endReason} IS NULL) OR
    (${table.state} = 'expired' AND ${table.endedAt} IS NOT NULL AND ${table.endReason} IS NOT NULL AND ${table.endedAt} = ${table.expiresAt} AND ${table.endReason} = 'reservation_expired') OR
    (${table.state} = 'cancelled' AND ${table.endedAt} IS NOT NULL AND ${table.endedAt} >= ${table.reservedAt}
      AND ${table.endReason} IS NOT NULL AND ${table.endReason} IN ('cancelled_by_user', 'battery_too_low', 'vehicle_unavailable')) OR
    (${table.state} = 'finished' AND ${table.endedAt} IS NOT NULL AND ${table.startedAt} IS NOT NULL AND ${table.endedAt} >= ${table.startedAt} AND ${table.endReason} IS NOT NULL AND ${table.endReason} IN ('finished_by_user', 'battery_depleted'))
  )`),
  check('rentals_trip_snapshot', sql`(
    (${table.state} IN ('reserved', 'cancelled', 'expired') AND ${table.startedAt} IS NULL AND ${table.rideRateMinorPerMinute} IS NULL AND ${table.pauseRateMinorPerMinute} IS NULL AND ${table.currency} IS NULL AND ${table.billingPolicy} IS NULL AND ${table.zoneSnapshot} IS NULL) OR
    (${table.state} IN ('riding', 'paused', 'finished') AND ${table.startedAt} IS NOT NULL AND ${table.startedAt} >= ${table.reservedAt} AND ${table.startedAt} < ${table.expiresAt}
      AND ${table.rideRateMinorPerMinute} IS NOT NULL AND ${table.rideRateMinorPerMinute} >= 0 AND ${table.pauseRateMinorPerMinute} IS NOT NULL AND ${table.pauseRateMinorPerMinute} >= 0
      AND ${table.currency} IS NOT NULL AND ${table.currency} = 'KGS' AND ${table.billingPolicy} IS NOT NULL AND ${table.billingPolicy} = 'ceil-per-mode-v1' AND ${table.zoneSnapshot} IS NOT NULL)
  )`),
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  rentalId: uuid('rental_id').notNull().references(() => rentals.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 40 }).$type<'RESERVATION_EXPIRING' | 'RESERVATION_EXPIRED' | 'RESERVATION_UNAVAILABLE' | 'TRIP_FINISHED'>().notNull(),
  reason: varchar('reason', { length: 32 }).$type<'finished_by_user' | 'battery_depleted'>(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
}, table => [
  foreignKey({ name: 'notifications_rental_owner_fk', columns: [table.rentalId, table.userId], foreignColumns: [rentals.id, rentals.userId] }).onDelete('restrict'),
  unique('notifications_one_logical_event').on(table.rentalId, table.code),
  index('notifications_owner_created').on(table.userId, table.createdAt),
  check('notifications_code_supported', sql`${table.code} IN ('RESERVATION_EXPIRING', 'RESERVATION_EXPIRED', 'RESERVATION_UNAVAILABLE', 'TRIP_FINISHED')`),
  check('notifications_deadline_reason', sql`(${table.code} = 'TRIP_FINISHED' AND ${table.expiresAt} IS NULL AND ${table.reason} IS NOT NULL AND ${table.reason} IN ('finished_by_user', 'battery_depleted')) OR (${table.code} <> 'TRIP_FINISHED' AND ${table.expiresAt} IS NOT NULL AND ${table.reason} IS NULL)`),
]);

export const idempotencyRequests = pgTable('idempotency_requests', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  key: uuid('key').notNull(),
  operation: varchar('operation', { length: 32 }).notNull(),
  requestHash: varchar('request_hash', { length: 64 }).notNull(),
  result: jsonb('result').$type<StoredCommandResult>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.key] })]);

export const jobHeartbeats = pgTable('job_heartbeats', {
  name: varchar('name', { length: 64 }).primaryKey(),
  configHash: varchar('config_hash', { length: 64 }).notNull(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const tripIntervals = pgTable('trip_intervals', {
  id: uuid('id').primaryKey().defaultRandom(),
  rentalId: uuid('rental_id').notNull().references(() => rentals.id, { onDelete: 'restrict' }),
  mode: varchar('mode', { length: 16 }).$type<'riding' | 'paused'>().notNull(),
  ordinal: integer('ordinal').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
}, table => [
  uniqueIndex('trip_intervals_one_open').on(table.rentalId).where(sql`${table.endedAt} IS NULL`),
  unique('trip_intervals_order').on(table.rentalId, table.ordinal),
  index('trip_intervals_timeline').on(table.rentalId, table.startedAt),
  check('trip_intervals_mode', sql`${table.mode} IN ('riding', 'paused')`),
  check('trip_intervals_ordinal', sql`${table.ordinal} >= 0`),
  check('trip_intervals_times', sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt}`),
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  rentalId: uuid('rental_id').notNull().unique(),
  userId: uuid('user_id').notNull(),
  currency: varchar('currency', { length: 3 }).$type<'KGS'>().notNull(),
  billingPolicy: varchar('billing_policy', { length: 32 }).$type<'ceil-per-mode-v1'>().notNull(),
  rideRateMinorPerMinute: integer('ride_rate_minor_per_minute').notNull(),
  pauseRateMinorPerMinute: integer('pause_rate_minor_per_minute').notNull(),
  activeMs: bigint('active_ms', { mode: 'bigint' }).notNull(),
  pausedMs: bigint('paused_ms', { mode: 'bigint' }).notNull(),
  activeMinutes: bigint('active_minutes', { mode: 'bigint' }).notNull(),
  pausedMinutes: bigint('paused_minutes', { mode: 'bigint' }).notNull(),
  totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
  status: varchar('status', { length: 16 }).$type<'unpaid' | 'paid'>().notNull().default('unpaid'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
}, table => [
  foreignKey({ name: 'invoices_rental_owner_fk', columns: [table.rentalId, table.userId], foreignColumns: [rentals.id, rentals.userId] }).onDelete('restrict'),
  unique('invoices_payment_identity').on(table.id, table.totalMinor, table.currency),
  index('invoices_owner_history').on(table.userId, table.createdAt),
  check('invoices_currency_policy', sql`${table.currency} = 'KGS' AND ${table.billingPolicy} = 'ceil-per-mode-v1'`),
  check('invoices_amounts', sql`${table.activeMs} >= 0 AND ${table.pausedMs} >= 0 AND ${table.rideRateMinorPerMinute} >= 0 AND ${table.pauseRateMinorPerMinute} >= 0 AND ${table.totalMinor} >= 0
    AND ${table.activeMinutes} = (${table.activeMs} + 59999) / 60000 AND ${table.pausedMinutes} = (${table.pausedMs} + 59999) / 60000
    AND ${table.totalMinor} = ${table.activeMinutes} * ${table.rideRateMinorPerMinute}::bigint + ${table.pausedMinutes} * ${table.pauseRateMinorPerMinute}::bigint`),
  check('invoices_payment_state', sql`(${table.status} = 'unpaid' AND ${table.paidAt} IS NULL) OR (${table.status} = 'paid' AND ${table.paidAt} IS NOT NULL AND ${table.paidAt} >= ${table.createdAt})`),
]);

export const demoPayments = pgTable('demo_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().unique(),
  provider: varchar('provider', { length: 16 }).$type<'demo'>().notNull().default('demo'),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  currency: varchar('currency', { length: 3 }).$type<'KGS'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
}, table => [
  foreignKey({ name: 'demo_payments_invoice_amount_fk', columns: [table.invoiceId, table.amountMinor, table.currency], foreignColumns: [invoices.id, invoices.totalMinor, invoices.currency] }).onDelete('restrict'),
  check('demo_payments_provider', sql`${table.provider} = 'demo'`),
]);

export const tripSimulations = pgTable('trip_simulations', {
  rentalId: uuid('rental_id').primaryKey().references(() => rentals.id, { onDelete: 'restrict' }),
  lastAt: timestamp('last_at', { withTimezone: true, mode: 'date' }).notNull(),
  distanceMm: bigint('distance_mm', { mode: 'bigint' }).notNull().default(sql`0`),
  distanceRemainder: integer('distance_remainder').notNull().default(0),
  rideDrainBpPerMinute: integer('ride_drain_bp_per_minute').notNull(),
  pauseDrainBpPerMinute: integer('pause_drain_bp_per_minute').notNull(),
  speedMmPerMinute: integer('speed_mm_per_minute').notNull(),
  tickMs: integer('tick_ms').notNull(),
  route: jsonb('route').$type<SimulationRoute>().notNull(),
}, table => [
  index('trip_simulations_due').on(table.lastAt),
  check('trip_simulations_remainders', sql`${table.distanceRemainder} BETWEEN 0 AND 59999 AND ${table.distanceMm} >= 0`),
  check('trip_simulations_rates', sql`${table.rideDrainBpPerMinute} BETWEEN 1 AND 10000000 AND ${table.pauseDrainBpPerMinute} BETWEEN 1 AND 10000000 AND ${table.speedMmPerMinute} BETWEEN 0 AND 10000000 AND ${table.tickMs} BETWEEN 100 AND 60000`),
]);

export const mailOutbox = pgTable('mail_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().unique().references(() => invoices.id, { onDelete: 'restrict' }),
  recipient: varchar('recipient', { length: 254 }).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
}, table => [
  unique('mail_outbox_identity').on(table.id, table.invoiceId),
  index('mail_outbox_pending').on(table.createdAt).where(sql`${table.deliveredAt} IS NULL`),
  check('mail_outbox_delivery_time', sql`${table.deliveredAt} IS NULL OR ${table.deliveredAt} >= ${table.createdAt}`),
]);

export const localMailbox = pgTable('local_mailbox', {
  id: uuid('id').primaryKey(),
  invoiceId: uuid('invoice_id').notNull().unique(),
  recipient: varchar('recipient', { length: 254 }).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull(),
}, table => [foreignKey({ name: 'local_mailbox_logical_event_fk', columns: [table.id, table.invoiceId], foreignColumns: [mailOutbox.id, mailOutbox.invoiceId] }).onDelete('restrict')]);

export const realtimeTickets = pgTable('realtime_tickets', {
  hash: varchar('hash', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
}, table => [index('realtime_tickets_expiry').on(table.expiresAt)]);
