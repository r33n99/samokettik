import { eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { localMailbox, mailOutbox } from '../db/schema.js';
import { databaseNow } from '../modules/reservations/service.js';

// Local mail transport with an idempotent receiver in the same PostgreSQL.
// Acceptance and outbox acknowledgement commit together; no SMTP ambiguity.
export async function deliverLocalMail(database: Database, batchSize: number): Promise<number> {
  return database.db.transaction(async tx => {
    const messages = await tx.select().from(mailOutbox).where(isNull(mailOutbox.deliveredAt)).orderBy(mailOutbox.createdAt, mailOutbox.id).limit(batchSize).for('update', { skipLocked: true });
    if (messages.length === 0) return 0;
    const time = await databaseNow(tx);
    for (const message of messages) {
      await tx.insert(localMailbox).values({ id: message.id, invoiceId: message.invoiceId, recipient: message.recipient, subject: message.subject, body: message.body, receivedAt: time }).onConflictDoNothing();
      await tx.update(mailOutbox).set({ deliveredAt: time }).where(eq(mailOutbox.id, message.id));
    }
    return messages.length;
  });
}
