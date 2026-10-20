import { and, eq, isNull } from 'drizzle-orm';
import { invoices, mailOutbox, notifications, rentals, tripIntervals, users } from '../../db/schema.js';
import { ReservationUnavailableError, type Transaction } from '../reservations/service.js';
import { calculateFare, sumIntervals } from './billing.js';
import type { RentalRow } from './view.js';

export type FinishReason = 'finished_by_user' | 'battery_depleted';
export function formatMinor(amount: bigint): string { return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`; }
export async function finishLockedTrip(tx: Transaction, rental: RentalRow, intervals: typeof tripIntervals.$inferSelect[], endedAt: Date, reason: FinishReason, observedAt = endedAt): Promise<RentalRow> {
  const open = intervals.at(-1);
  if (!open || open.endedAt !== null || (rental.state !== 'riding' && rental.state !== 'paused') || open.mode !== rental.state || endedAt < open.startedAt || !rental.startedAt || rental.rideRateMinorPerMinute === null || rental.pauseRateMinorPerMinute === null || !rental.currency || !rental.billingPolicy) throw new ReservationUnavailableError();
  const duration = sumIntervals(intervals, rental.startedAt, endedAt);
  const fare = calculateFare(duration.activeMs, duration.pausedMs, rental.rideRateMinorPerMinute, rental.pauseRateMinorPerMinute);
  await tx.update(tripIntervals).set({ endedAt }).where(and(eq(tripIntervals.id, open.id), isNull(tripIntervals.endedAt)));
  const [finished] = await tx.update(rentals).set({ state: 'finished', endedAt, endReason: reason }).where(eq(rentals.id, rental.id)).returning();
  const [invoice] = await tx.insert(invoices).values({ rentalId: rental.id, userId: rental.userId, currency: rental.currency, billingPolicy: rental.billingPolicy, rideRateMinorPerMinute: rental.rideRateMinorPerMinute, pauseRateMinorPerMinute: rental.pauseRateMinorPerMinute, ...fare, createdAt: endedAt }).returning();
  const [owner] = await tx.select({ email: users.emailNormalized }).from(users).where(eq(users.id, rental.userId));
  if (!finished || !invoice || !owner) throw new ReservationUnavailableError();
  await tx.insert(notifications).values({ rentalId: rental.id, userId: rental.userId, code: 'TRIP_FINISHED', reason, expiresAt: null, createdAt: observedAt }).onConflictDoNothing();
  await tx.insert(mailOutbox).values({ invoiceId: invoice.id, recipient: owner.email, subject: `СамоКеттик: счёт за поездку ${rental.id}`, createdAt: observedAt,
    body: `Счёт: ${invoice.id}\nПоездка: ${rental.id}\nЗавершение: ${endedAt.toISOString()}\nПричина: ${reason === 'battery_depleted' ? 'Автоматическое завершение: аккумулятор полностью разряжен' : 'Поездка завершена пользователем'}\nДвижение: ${fare.activeMinutes} мин × ${formatMinor(BigInt(rental.rideRateMinorPerMinute))} KGS\nПауза: ${fare.pausedMinutes} мин × ${formatMinor(BigInt(rental.pauseRateMinorPerMinute))} KGS\nИтого: ${formatMinor(fare.totalMinor)} KGS\nОплата по факту через демонстрационную заглушку. Реальное списание средств не выполнялось.`,
  });
  return finished;
}
