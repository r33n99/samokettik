import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorResponseSchema, NotificationListSchema, ReservationResultSchema, ReservationSchema, TripSchema, UuidSchema, VehicleListSchema } from '@samokettik/contracts';
import type { BusinessConfig } from '../../config/business.js';
import type { Environment } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { demoUserId } from '../auth/demo.js';
import { cancelReservation, reserveVehicle } from './service.js';
import { currentReservation, listNotifications, listVehicles } from './queries.js';

const commandHeaders = Type.Object({ 'idempotency-key': UuidSchema }, { additionalProperties: true });
const createBody = Type.Object({ vehicleId: UuidSchema }, { additionalProperties: false });
const cancelParams = Type.Object({ id: UuidSchema }, { additionalProperties: false });
const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 503: ErrorResponseSchema };

class IdentityError extends Error {
  constructor(readonly status: 401 | 503, readonly code: string, message: string) { super(message); }
}
export function owner(env: Environment, request: FastifyRequest): string {
  if (!env.demoAuthEnabled) throw new IdentityError(503, 'AUTH_NOT_CONFIGURED', 'Демо-доступ отключён. Полноценная авторизация ещё не настроена');
  const userId = demoUserId(env, request.headers.authorization);
  if (!userId) throw new IdentityError(401, 'UNAUTHORIZED', 'Нужен действующий токен пользователя');
  return userId;
}
export function identityFailure(error: unknown): { status: number; code: string; message: string } | null {
  return error instanceof IdentityError ? { status: error.status, code: error.code, message: error.message } : null;
}

export function registerReservationRoutes(app: FastifyInstance, env: Environment, config: BusinessConfig, database: Database): void {
  app.get('/api/v1/vehicles', { schema: { response: { 200: VehicleListSchema, 503: ErrorResponseSchema } } }, () => listVehicles(database, config));
  app.get('/api/v1/rentals/current', { schema: { response: { 200: Type.Object({ serverTime: Type.String(), reservation: Type.Union([ReservationSchema, Type.Null()]), trip: Type.Union([TripSchema, Type.Null()]) }, { additionalProperties: false }), ...errors } } }, request => currentReservation(database, owner(env, request)));
  app.get('/api/v1/notifications', { schema: { response: { 200: NotificationListSchema, ...errors } } }, request => listNotifications(database, owner(env, request)));

  app.post<{ Body: { vehicleId: string }; Headers: { 'idempotency-key': string } }>('/api/v1/reservations', {
    schema: { headers: commandHeaders, body: createBody, response: { 201: ReservationResultSchema, ...errors } },
  }, async (request, reply) => {
    const result = await reserveVehicle(database, config, owner(env, request), request.headers['idempotency-key'].toLowerCase(), request.body.vehicleId.toLowerCase());
    return reply.status(result.status).send('code' in result.body ? { ...result.body, requestId: request.id } : result.body);
  });
  app.post<{ Params: { id: string }; Headers: { 'idempotency-key': string } }>('/api/v1/reservations/:id/cancel', {
    preValidation: async request => { if (request.body === undefined) request.body = {}; },
    schema: { params: cancelParams, headers: commandHeaders, body: Type.Object({}, { additionalProperties: false }), response: { 200: ReservationResultSchema, ...errors } },
  }, async (request, reply) => {
    const result = await cancelReservation(database, owner(env, request), request.headers['idempotency-key'].toLowerCase(), request.params.id.toLowerCase());
    return reply.status(result.status).send('code' in result.body ? { ...result.body, requestId: request.id } : result.body);
  });
}
