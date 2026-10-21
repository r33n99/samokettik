import { createHash, randomBytes } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ErrorResponseSchema, MailboxSchema, RealtimeTicketSchema, SyncStateSchema } from '@samokettik/contracts';
import type { Environment } from '../../config/env.js';
import type { BusinessConfig } from '../../config/business.js';
import type { Database } from '../../db/client.js';
import { realtimeTickets } from '../../db/schema.js';
import { owner } from '../reservations/routes.js';
import { demoSessionExpiry } from '../auth/session.js';
import { databaseNow } from '../reservations/service.js';
import { mailboxSnapshot, syncState } from './snapshot.js';

const digest = (ticket: string) => createHash('sha256').update(ticket).digest('hex');
export async function consumeTicket(database: Database, ticket: string) {
  const [consumed] = await database.db.delete(realtimeTickets).where(and(eq(realtimeTickets.hash, digest(ticket)), gt(realtimeTickets.expiresAt, sql`clock_timestamp()`))).returning({ userId: realtimeTickets.userId, authExpiresAt: realtimeTickets.authExpiresAt });
  return consumed ?? null;
}
export function registerSyncRoutes(app: FastifyInstance, env: Environment, config: BusinessConfig, database: Database) {
  const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 503: ErrorResponseSchema };
  app.get('/api/v1/sync', { schema: { response: { 200: SyncStateSchema, ...errors } } }, request => syncState(database, config, owner(env, request)));
  app.get('/api/v1/mailbox', { schema: { response: { 200: MailboxSchema, ...errors } } }, request => {
    const userId = owner(env, request);
    return database.db.transaction(tx => mailboxSnapshot(tx, userId), { isolationLevel: 'repeatable read', accessMode: 'read only' });
  });
  app.post('/api/v1/realtime/tickets', {
    preValidation: async request => { if (request.body === undefined) request.body = {}; },
    schema: { body: Type.Object({}, { additionalProperties: false }), response: { 200: RealtimeTicketSchema, ...errors } },
  }, async request => {
    const userId = owner(env, request), ticket = randomBytes(32).toString('hex');
    const authExpiresAt = demoSessionExpiry(env, request.headers.authorization);
    const expiresAt = await database.db.transaction(async tx => {
      const time = await databaseNow(tx), expiresAt = new Date(Math.min(time.getTime() + env.wsTicketSeconds * 1000, authExpiresAt?.getTime() ?? Infinity));
      await tx.insert(realtimeTickets).values({ hash: digest(ticket), userId, expiresAt, authExpiresAt });
      return expiresAt;
    });
    return { ticket, expiresAt: expiresAt.toISOString() };
  });
}
