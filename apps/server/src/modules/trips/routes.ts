import { Type } from '@sinclair/typebox';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ErrorResponseSchema, HistoryQuerySchema, InvoiceHistorySchema, TripHistorySchema, PaymentResultSchema, ServiceZoneSchema, TripResultSchema, UuidSchema, type HistoryQuery } from '@samokettik/contracts';
import type { BusinessConfig } from '../../config/business.js';
import type { Environment } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { invoices, rentals } from '../../db/schema.js';
import { owner } from '../reservations/routes.js';
import { databaseNow } from '../reservations/service.js';
import { payDemoInvoice } from '../billing/service.js';
import { startTrip, transitionTrip } from './service.js';
import { invoiceDto, tripResult } from './view.js';

const headers = Type.Object({ 'idempotency-key': UuidSchema }, { additionalProperties: true });
const params = Type.Object({ id: UuidSchema }, { additionalProperties: false });
const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 503: ErrorResponseSchema };
export function registerTripRoutes(app: FastifyInstance, env: Environment, config: BusinessConfig, database: Database): void {
  app.get('/api/v1/service-zone', { schema: { response: { 200: ServiceZoneSchema } } }, () => config.serviceZone);
  for (const action of ['start', 'pause', 'resume', 'finish'] as const) {
    app.post<{ Params: { id: string }; Headers: { 'idempotency-key': string } }>(`/api/v1/trips/:id/${action}`, {
      preValidation: async request => { if (request.body === undefined) request.body = {}; },
      schema: { headers, params, body: Type.Object({}, { additionalProperties: false }), response: { 200: TripResultSchema, ...errors } },
    }, async (request, reply) => {
      const userId = owner(env, request), key = request.headers['idempotency-key'].toLowerCase(), id = request.params.id.toLowerCase();
      const result = action === 'start' ? await startTrip(database, config, userId, key, id) : await transitionTrip(database, config, userId, key, id, action);
      return reply.status(result.status).send('code' in result.body ? { ...result.body, requestId: request.id } : result.body);
    });
  }
  app.get<{ Params: { id: string } }>('/api/v1/trips/:id', { schema: { params, response: { 200: TripResultSchema, ...errors } } }, async (request, reply) => {
    const userId = owner(env, request);
    const result = await database.db.transaction(async tx => {
      const time = await databaseNow(tx);
      const [row] = await tx.select().from(rentals).where(and(eq(rentals.id, request.params.id.toLowerCase()), eq(rentals.userId, userId)));
      if (!row || !row.startedAt) return null;
      return tripResult(tx, row, time);
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
    return result ?? reply.status(404).send({ code: 'TRIP_NOT_FOUND', message: 'Поездка не найдена', requestId: request.id });
  });
  app.get<{ Querystring: HistoryQuery }>('/api/v1/trips', { schema: { querystring: HistoryQuerySchema, response: { 200: TripHistorySchema, ...errors } } }, async request => {
    const userId = owner(env, request);
    const { cursor, limit = 20 } = request.query;
    return database.db.transaction(async tx => {
      const time = await databaseNow(tx);
      // Resolve the timestamp in PostgreSQL to preserve microsecond precision.
      // An unknown/foreign cursor produces an empty page, never another owner's data.
      const rows = await tx.select().from(rentals).where(and(eq(rentals.userId, userId), eq(rentals.state, 'finished'), cursor
        ? sql`(${rentals.endedAt}, ${rentals.id}) < (SELECT ended_at, id FROM rentals WHERE id = ${cursor}::uuid AND user_id = ${userId}::uuid AND state = 'finished')`
        : undefined)).orderBy(desc(rentals.endedAt), desc(rentals.id)).limit(limit + 1);
      const page = rows.slice(0, limit);
      const items = [];
      for (const row of page) items.push(await tripResult(tx, row, time));
      return { items, nextCursor: rows.length > limit ? page.at(-1)!.id : null };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  });
  app.get<{ Querystring: HistoryQuery }>('/api/v1/invoices', { schema: { querystring: HistoryQuerySchema, response: { 200: InvoiceHistorySchema, ...errors } } }, async request => {
    const userId = owner(env, request), { cursor, limit = 20 } = request.query;
    const rows = await database.db.select().from(invoices).where(and(eq(invoices.userId, userId), cursor
      ? sql`(${invoices.createdAt}, ${invoices.id}) < (SELECT created_at, id FROM invoices WHERE id = ${cursor}::uuid AND user_id = ${userId}::uuid)`
      : undefined)).orderBy(desc(invoices.createdAt), desc(invoices.id)).limit(limit + 1);
    const page = rows.slice(0, limit);
    return { items: page.map(invoiceDto), nextCursor: rows.length > limit ? page.at(-1)!.id : null };
  });
  app.post<{ Params: { id: string }; Headers: { 'idempotency-key': string }; Body: { outcome?: 'approved' | 'declined' } }>('/api/v1/invoices/:id/pay-demo', {
    preValidation: async request => { if (request.body === undefined) request.body = {}; },
    schema: { headers, params, body: Type.Object({ outcome: Type.Optional(Type.Union([Type.Literal('approved'), Type.Literal('declined')])) }, { additionalProperties: false }), response: { 200: PaymentResultSchema, ...errors } },
  }, async (request, reply) => {
    const result = await payDemoInvoice(database, owner(env, request), request.headers['idempotency-key'].toLowerCase(), request.params.id.toLowerCase(), request.body.outcome ?? 'approved');
    return reply.status(result.status).send('code' in result.body ? { ...result.body, requestId: request.id } : result.body);
  });
}
