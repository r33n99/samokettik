import { desc, eq } from 'drizzle-orm';
import type { SyncState } from '@samokettik/contracts';
import type { BusinessConfig } from '../../config/business.js';
import type { Database } from '../../db/client.js';
import { invoices, localMailbox } from '../../db/schema.js';
import { databaseNow, type Transaction } from '../reservations/service.js';
import { currentSnapshot, fleetSnapshot, notificationSnapshot } from '../reservations/queries.js';
import { invoiceDto } from '../trips/view.js';

export async function mailboxSnapshot(tx: Transaction, userId: string) {
  const rows = await tx.select({ message: localMailbox }).from(localMailbox).innerJoin(invoices, eq(invoices.id, localMailbox.invoiceId)).where(eq(invoices.userId, userId)).orderBy(desc(localMailbox.receivedAt), desc(localMailbox.id)).limit(100);
  return { items: rows.map(({ message }) => ({ ...message, receivedAt: message.receivedAt.toISOString() })) };
}
export async function syncState(database: Database, config: BusinessConfig, userId: string): Promise<SyncState> {
  return database.db.transaction(async tx => {
    const time = await databaseNow(tx);
    const fleet = await fleetSnapshot(tx, config, time);
    const current = await currentSnapshot(tx, userId, time);
    const notifications = await notificationSnapshot(tx, userId);
    const rows = await tx.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.createdAt), desc(invoices.id)).limit(100);
    const mailbox = await mailboxSnapshot(tx, userId);
    return { serverTime: time.toISOString(), fleet, current, notifications, invoices: { items: rows.map(invoiceDto) }, mailbox };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
