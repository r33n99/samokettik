import { and, eq } from 'drizzle-orm';
import type { PaymentResult, StoredCommandResult } from '@samokettik/contracts';
import type { Database } from '../../db/client.js';
import { demoPayments, invoices } from '../../db/schema.js';
import { databaseNow, failure, rentalCommand, ReservationUnavailableError } from '../reservations/service.js';
import { invoiceDto } from '../trips/view.js';

export function payDemoInvoice(database: Database, userId: string, key: string, invoiceId: string, outcome: 'approved' | 'declined'): Promise<StoredCommandResult> {
  return rentalCommand(database, userId, key, 'invoice-pay-demo', { invoiceId, outcome }, async tx => {
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId))).for('update');
    if (!invoice) return failure('INVOICE_NOT_FOUND', 'Счёт не найден', 404);
    const [existing] = await tx.select().from(demoPayments).where(eq(demoPayments.invoiceId, invoiceId));
    const paymentDto = (payment: typeof demoPayments.$inferSelect): PaymentResult['payment'] => ({ id: payment.id, invoiceId: payment.invoiceId, provider: payment.provider, amountMinor: payment.amountMinor.toString(), currency: payment.currency, createdAt: payment.createdAt.toISOString() });
    if (invoice.status === 'paid') {
      if (!existing) throw new ReservationUnavailableError();
      return { status: 200, body: { invoice: invoiceDto(invoice), payment: paymentDto(existing) } };
    }
    if (outcome === 'declined') return failure('PAYMENT_DECLINED', 'Демонстрационная оплата отклонена. Счёт остаётся неоплаченным');
    const time = await databaseNow(tx);
    if (time < invoice.createdAt) throw new ReservationUnavailableError();
    const [payment] = await tx.insert(demoPayments).values({ invoiceId, amountMinor: invoice.totalMinor, currency: invoice.currency, createdAt: time }).returning();
    const [updated] = await tx.update(invoices).set({ status: 'paid', paidAt: time }).where(eq(invoices.id, invoiceId)).returning();
    if (!payment || !updated) throw new ReservationUnavailableError();
    return { status: 200, body: { invoice: invoiceDto(updated), payment: paymentDto(payment) } };
  });
}
