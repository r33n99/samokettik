import { Type, type Static } from "@sinclair/typebox";

export const ErrorResponseSchema = Type.Object(
  {
    code: Type.String(),
    message: Type.String(),
    requestId: Type.String(),
  },
  { additionalProperties: false },
);

export const ReadinessSchema = Type.Object(
  {
    status: Type.Literal("ready"),
    database: Type.Literal("connected"),
    schemaVersion: Type.Literal(5),
    reservationWorker: Type.Literal("running"),
  },
  { additionalProperties: false },
);
export type Readiness = Static<typeof ReadinessSchema>;

export const SystemInfoSchema = Type.Object(
  {
    name: Type.String(),
    city: Type.String(),
    timezone: Type.String(),
    currency: Type.String(),
    vehicleCount: Type.Integer({ minimum: 0 }),
    configuredVehicleCount: Type.Integer({ minimum: 1 }),
    serverTime: Type.String(),
  },
  { additionalProperties: false },
);
export type SystemInfo = Static<typeof SystemInfoSchema>;

export const UuidSchema = Type.String({
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});
export const ReservationSchema = Type.Object(
  {
    id: UuidSchema,
    vehicleId: UuidSchema,
    state: Type.Union([
      Type.Literal("reserved"),
      Type.Literal("cancelled"),
      Type.Literal("expired"),
    ]),
    reservedAt: Type.String(),
    warnAt: Type.String(),
    expiresAt: Type.String(),
    endedAt: Type.Union([Type.String(), Type.Null()]),
    endReason: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export type Reservation = Static<typeof ReservationSchema>;
export const ReservationResultSchema = Type.Object(
  { reservation: ReservationSchema },
  { additionalProperties: false },
);
export const CommandErrorSchema = Type.Object(
  { code: Type.String(), message: Type.String() },
  { additionalProperties: false },
);
export const StoredReservationResultSchema = Type.Union([
  Type.Object(
    {
      status: Type.Union([Type.Literal(200), Type.Literal(201)]),
      body: ReservationResultSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Union([Type.Literal(404), Type.Literal(409)]),
      body: CommandErrorSchema,
    },
    { additionalProperties: false },
  ),
]);
export type StoredReservationResult = Static<
  typeof StoredReservationResultSchema
>;

export const VehicleListSchema = Type.Object(
  {
    items: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          publicCode: Type.String(),
          batteryBp: Type.Integer(),
          latitude: Type.Number(),
          longitude: Type.Number(),
          status: Type.Union([
            Type.Literal("available"),
            Type.Literal("reserved"),
            Type.Literal("in_ride"),
            Type.Literal("unavailable"),
          ]),
          unavailableReason: Type.Union([
            Type.Literal("BATTERY_TOO_LOW"),
            Type.Literal("MAINTENANCE"),
            Type.Null(),
          ]),
        },
        { additionalProperties: false },
      ),
    ),
    serverTime: Type.String(),
  },
  { additionalProperties: false },
);

export const NotificationListSchema = Type.Object(
  {
    items: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          rentalId: UuidSchema,
          code: Type.String(),
          message: Type.String(),
          expiresAt: Type.Union([Type.String(), Type.Null()]),
          createdAt: Type.String(),
          reason: Type.Union([Type.String(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const PositionSchema = Type.Tuple([
  Type.Number({ minimum: -180, maximum: 180 }),
  Type.Number({ minimum: -90, maximum: 90 }),
]);
const RingSchema = Type.Array(PositionSchema, { minItems: 4 });
const PolygonCoordinatesSchema = Type.Array(RingSchema, { minItems: 1 });
export const ServiceZoneSchema = Type.Object(
  {
    version: Type.String({ minLength: 1 }),
    source: Type.String({ minLength: 1 }),
    retrievedAt: Type.String(),
    attribution: Type.String(),
    geometry: Type.Union([
      Type.Object(
        {
          type: Type.Literal("Polygon"),
          coordinates: PolygonCoordinatesSchema,
        },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          type: Type.Literal("MultiPolygon"),
          coordinates: Type.Array(PolygonCoordinatesSchema, { minItems: 1 }),
        },
        { additionalProperties: false },
      ),
    ]),
  },
  { additionalProperties: false },
);
export type ServiceZone = Static<typeof ServiceZoneSchema>;
const UnsignedDecimalSchema = Type.String({ pattern: "^(0|[1-9][0-9]*)$" });
export const InvoiceSchema = Type.Object(
  {
    id: UuidSchema,
    rentalId: UuidSchema,
    currency: Type.Literal("KGS"),
    status: Type.Union([Type.Literal("unpaid"), Type.Literal("paid")]),
    activeMilliseconds: UnsignedDecimalSchema,
    pausedMilliseconds: UnsignedDecimalSchema,
    activeMinutes: UnsignedDecimalSchema,
    pausedMinutes: UnsignedDecimalSchema,
    rideRateMinorPerMinute: Type.Integer(),
    pauseRateMinorPerMinute: Type.Integer(),
    totalMinor: UnsignedDecimalSchema,
    billingPolicy: Type.Literal("ceil-per-mode-v1"),
    createdAt: Type.String(),
    paidAt: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export type Invoice = Static<typeof InvoiceSchema>;
export const TripSchema = Type.Object(
  {
    id: UuidSchema,
    vehicleId: UuidSchema,
    state: Type.Union([
      Type.Literal("riding"),
      Type.Literal("paused"),
      Type.Literal("finished"),
    ]),
    startedAt: Type.String(),
    endedAt: Type.Union([Type.String(), Type.Null()]),
    endReason: Type.Optional(
      Type.Union([
        Type.Literal("finished_by_user"),
        Type.Literal("battery_depleted"),
        Type.Null(),
      ]),
    ),
    activeMilliseconds: UnsignedDecimalSchema,
    pausedMilliseconds: UnsignedDecimalSchema,
    rideRateMinorPerMinute: Type.Integer(),
    pauseRateMinorPerMinute: Type.Integer(),
    totalMinor: UnsignedDecimalSchema,
    currency: Type.Literal("KGS"),
    billingPolicy: Type.Literal("ceil-per-mode-v1"),
    zoneVersion: Type.String(),
  },
  { additionalProperties: false },
);
export type Trip = Static<typeof TripSchema>;
export const TripResultSchema = Type.Object(
  { trip: TripSchema, invoice: Type.Union([InvoiceSchema, Type.Null()]) },
  { additionalProperties: false },
);
export type TripResult = Static<typeof TripResultSchema>;
export const PaymentSchema = Type.Object(
  {
    id: UuidSchema,
    invoiceId: UuidSchema,
    provider: Type.Literal("demo"),
    amountMinor: UnsignedDecimalSchema,
    currency: Type.Literal("KGS"),
    createdAt: Type.String(),
  },
  { additionalProperties: false },
);
export const PaymentResultSchema = Type.Object(
  { invoice: InvoiceSchema, payment: PaymentSchema },
  { additionalProperties: false },
);
export type PaymentResult = Static<typeof PaymentResultSchema>;
export const StoredCommandResultSchema = Type.Union([
  StoredReservationResultSchema,
  Type.Object(
    { status: Type.Literal(200), body: TripResultSchema },
    { additionalProperties: false },
  ),
  Type.Object(
    { status: Type.Literal(200), body: PaymentResultSchema },
    { additionalProperties: false },
  ),
]);
export type StoredCommandResult = Static<typeof StoredCommandResultSchema>;

export const MailboxSchema = Type.Object(
  {
    items: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          invoiceId: UuidSchema,
          recipient: Type.String(),
          subject: Type.String(),
          body: Type.String(),
          receivedAt: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export const CurrentRentalSchema = Type.Object(
  {
    serverTime: Type.String(),
    reservation: Type.Union([ReservationSchema, Type.Null()]),
    trip: Type.Union([TripSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export const SyncStateSchema = Type.Object(
  {
    serverTime: Type.String(),
    fleet: VehicleListSchema,
    current: CurrentRentalSchema,
    notifications: NotificationListSchema,
    invoices: Type.Object(
      { items: Type.Array(InvoiceSchema) },
      { additionalProperties: false },
    ),
    mailbox: MailboxSchema,
  },
  { additionalProperties: false },
);
export type SyncState = Static<typeof SyncStateSchema>;
export type VehicleList = Static<typeof VehicleListSchema>;
export const RealtimeTicketSchema = Type.Object(
  {
    ticket: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    expiresAt: Type.String(),
  },
  { additionalProperties: false },
);
const FrameProperties = {
  connectionId: UuidSchema,
  sequence: Type.Integer({ minimum: 1 }),
};
export const RealtimeFrameSchema = Type.Union([
  Type.Object(
    {
      ...FrameProperties,
      type: Type.Literal("fleet_snapshot"),
      fleet: VehicleListSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...FrameProperties,
      type: Type.Literal("state_snapshot"),
      state: SyncStateSchema,
    },
    { additionalProperties: false },
  ),
]);
export type RealtimeFrame = Static<typeof RealtimeFrameSchema>;

export const DemoProfileSchema = Type.Union([
  Type.Literal("ru"),
  Type.Literal("ky"),
]);
export type DemoProfile = Static<typeof DemoProfileSchema>;
export const DemoSessionSchema = Type.Object(
  {
    profile: DemoProfileSchema,
    token: Type.String(),
    expiresAt: Type.String(),
  },
  { additionalProperties: false },
);
export type DemoSession = Static<typeof DemoSessionSchema>;
export const ClientConfigSchema = Type.Object(
  {
    name: Type.String(),
    city: Type.String(),
    timezone: Type.Literal("Asia/Bishkek"),
    currency: Type.Literal("KGS"),
    rideRateMinorPerMinute: Type.Integer(),
    pauseRateMinorPerMinute: Type.Integer(),
    reservationDurationSeconds: Type.Integer(),
    minRentalBatteryBp: Type.Integer(),
    demoBrowserEnabled: Type.Boolean(),
    profiles: Type.Array(
      Type.Object(
        { id: DemoProfileSchema, label: Type.String() },
        { additionalProperties: false },
      ),
    ),
    tileUrl: Type.String(),
  },
  { additionalProperties: false },
);
export type ClientConfig = Static<typeof ClientConfigSchema>;
export const TripHistorySchema = Type.Object(
  { items: Type.Array(TripResultSchema) },
  { additionalProperties: false },
);
export type TripHistory = Static<typeof TripHistorySchema>;
