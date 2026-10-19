import { Type, type Static } from '@sinclair/typebox';

export const ErrorResponseSchema = Type.Object({
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
}, { additionalProperties: false });

export const ReadinessSchema = Type.Object({
  status: Type.Literal('ready'),
  database: Type.Literal('connected'),
  schemaVersion: Type.Literal(2),
  reservationWorker: Type.Literal('running'),
}, { additionalProperties: false });
export type Readiness = Static<typeof ReadinessSchema>;

export const SystemInfoSchema = Type.Object({
  name: Type.String(),
  city: Type.String(),
  timezone: Type.String(),
  currency: Type.String(),
  vehicleCount: Type.Integer({ minimum: 0 }),
  configuredVehicleCount: Type.Integer({ minimum: 1 }),
  serverTime: Type.String(),
}, { additionalProperties: false });
export type SystemInfo = Static<typeof SystemInfoSchema>;

export const UuidSchema = Type.String({ pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' });
export const ReservationSchema = Type.Object({
  id: UuidSchema,
  vehicleId: UuidSchema,
  state: Type.Union([Type.Literal('reserved'), Type.Literal('cancelled'), Type.Literal('expired')]),
  reservedAt: Type.String(), warnAt: Type.String(), expiresAt: Type.String(),
  endedAt: Type.Union([Type.String(), Type.Null()]),
  endReason: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });
export type Reservation = Static<typeof ReservationSchema>;
export const ReservationResultSchema = Type.Object({ reservation: ReservationSchema }, { additionalProperties: false });
const CommandErrorSchema = Type.Object({ code: Type.String(), message: Type.String() }, { additionalProperties: false });
export const StoredReservationResultSchema = Type.Union([
  Type.Object({ status: Type.Union([Type.Literal(200), Type.Literal(201)]), body: ReservationResultSchema }, { additionalProperties: false }),
  Type.Object({ status: Type.Union([Type.Literal(404), Type.Literal(409)]), body: CommandErrorSchema }, { additionalProperties: false }),
]);
export type StoredReservationResult = Static<typeof StoredReservationResultSchema>;

export const VehicleListSchema = Type.Object({
  items: Type.Array(Type.Object({
    id: UuidSchema, publicCode: Type.String(), batteryBp: Type.Integer(), latitude: Type.Number(), longitude: Type.Number(),
    status: Type.Union([Type.Literal('available'), Type.Literal('reserved'), Type.Literal('unavailable')]),
    unavailableReason: Type.Union([Type.Literal('BATTERY_TOO_LOW'), Type.Literal('MAINTENANCE'), Type.Null()]),
  }, { additionalProperties: false })),
  serverTime: Type.String(),
}, { additionalProperties: false });

export const NotificationListSchema = Type.Object({ items: Type.Array(Type.Object({
  id: UuidSchema, rentalId: UuidSchema, code: Type.String(), message: Type.String(), expiresAt: Type.String(), createdAt: Type.String(),
}, { additionalProperties: false })) }, { additionalProperties: false });
