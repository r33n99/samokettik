import Fastify from 'fastify';
import { count, eq } from 'drizzle-orm';
import { ErrorResponseSchema, ReadinessSchema, SystemInfoSchema } from '@samokettik/contracts';
import type { Environment } from './config/env.js';
import { configHash, type BusinessConfig } from './config/business.js';
import type { Database } from './db/client.js';
import { appMetadata, vehicles } from './db/schema.js';
import { registerReservationRoutes, identityFailure } from './modules/reservations/routes.js';
import { ReservationUnavailableError } from './modules/reservations/service.js';
import { reservationWorkerHealthy } from './jobs/reservations.js';

export function buildApp(env: Environment, config: BusinessConfig, database: Database) {
  const app = Fastify({
    logger: { level: env.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    bodyLimit: 16384,
    requestTimeout: 10000,
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.addHook('onClose', () => database.close());
  app.setErrorHandler((error, request, reply) => {
    const identity = identityFailure(error);
    if (identity) return reply.status(identity.status).send({ code: identity.code, message: identity.message, requestId: request.id });
    if (error instanceof ReservationUnavailableError) return reply.status(503).send({ code: 'SERVICE_TEMPORARILY_UNAVAILABLE', message: 'Не удалось выполнить операцию. Повторите запрос с тем же ключом', requestId: request.id });
    const clientStatus = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : null;
    const validation = (error instanceof Error && 'validation' in error) || clientStatus !== null;
    if (!validation) request.log.error({ err: { message: 'Request failed', code: error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN' } }, 'Request failed');
    void reply.status(validation ? clientStatus ?? 400 : 500).send({ code: validation ? 'INVALID_REQUEST' : 'INTERNAL_ERROR', message: validation ? 'Некорректный запрос' : 'Не удалось обработать запрос', requestId: request.id });
  });
  app.setNotFoundHandler((request, reply) => reply.status(404).send({ code: 'NOT_FOUND', message: 'Ресурс не найден', requestId: request.id }));

  app.get('/health/live', { schema: { response: { 200: { type: 'object', properties: { status: { const: 'alive' } }, required: ['status'], additionalProperties: false } } } }, async () => ({ status: 'alive' }));

  app.get('/health/ready', { schema: { response: { 200: ReadinessSchema, 503: ErrorResponseSchema } } }, async (request, reply) => {
    try {
      const [metadata] = await database.db.select().from(appMetadata).where(eq(appMetadata.id, 1));
      // Query an application table as well, so missing migrations are not reported as ready.
      await database.db.select({ id: vehicles.id }).from(vehicles).limit(1);
      if (metadata?.schemaVersion !== 2) throw new Error('Schema version mismatch');
      if (!await reservationWorkerHealthy(database, config, env.workerStaleMs)) return reply.status(503).send({ code: 'WORKER_NOT_READY', message: 'Фоновая обработка бронирований ещё не готова', requestId: request.id });
      return { status: 'ready' as const, database: 'connected' as const, schemaVersion: 2 as const, reservationWorker: 'running' as const };
    } catch {
      return reply.status(503).send({ code: 'DATABASE_NOT_READY', message: 'База данных недоступна или миграции не применены', requestId: request.id });
    }
  });

  app.get('/api/v1/system', { schema: { response: { 200: SystemInfoSchema, 503: ErrorResponseSchema } } }, async (request, reply) => {
    try {
      const [fleet] = await database.db.select({ vehicleCount: count() }).from(vehicles);
      return { name: config.productName, city: config.city, timezone: config.timezone, currency: config.currency, configuredVehicleCount: config.fleetSize, vehicleCount: fleet?.vehicleCount ?? 0, serverTime: new Date().toISOString() };
    } catch {
      return reply.status(503).send({ code: 'DATABASE_NOT_READY', message: 'Не удалось загрузить данные из PostgreSQL', requestId: request.id });
    }
  });
  app.log.info({ configHash: configHash(config) }, 'Business configuration loaded');
  registerReservationRoutes(app, env, config, database);
  return app;
}
