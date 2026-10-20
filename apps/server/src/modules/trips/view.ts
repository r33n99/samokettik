import { eq } from 'drizzle-orm';
import type { Invoice, Trip, TripResult } from '@samokettik/contracts';
import { invoices, rentals, tripIntervals } from '../../db/schema.js';
import { ReservationUnavailableError, type Transaction } from '../reservations/service.js';
import { calculateFare, sumIntervals, type TimedInterval } from './billing.js';

export type RentalRow = typeof rentals.$inferSelect;
export function invoiceDto(row: typeof invoices.$inferSelect): Invoice {
  return { id: row.id, rentalId: row.rentalId, currency: row.currency, billingPolicy: row.billingPolicy, status: row.status,
    activeMilliseconds: row.activeMs.toString(), pausedMilliseconds: row.pausedMs.toString(), activeMinutes: row.activeMinutes.toString(), pausedMinutes: row.pausedMinutes.toString(),
    rideRateMinorPerMinute: row.rideRateMinorPerMinute, pauseRateMinorPerMinute: row.pauseRateMinorPerMinute, totalMinor: row.totalMinor.toString(), createdAt: row.createdAt.toISOString(), paidAt: row.paidAt?.toISOString() ?? null };
}
export function tripDto(row: RentalRow, intervals: readonly TimedInterval[], time: Date): Trip {
  if (!row.startedAt || row.rideRateMinorPerMinute === null || row.pauseRateMinorPerMinute === null || !row.currency || !row.billingPolicy || !row.zoneSnapshot || (row.state !== 'riding' && row.state !== 'paused' && row.state !== 'finished')) throw new ReservationUnavailableError();
  const durations = sumIntervals(intervals, row.startedAt, row.endedAt ?? time);
  const fare = calculateFare(durations.activeMs, durations.pausedMs, row.rideRateMinorPerMinute, row.pauseRateMinorPerMinute);
  return { id: row.id, vehicleId: row.vehicleId, state: row.state, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null,
    endReason: row.endReason === 'finished_by_user' || row.endReason === 'battery_depleted' ? row.endReason : null,
    activeMilliseconds: fare.activeMs.toString(), pausedMilliseconds: fare.pausedMs.toString(), totalMinor: fare.totalMinor.toString(), rideRateMinorPerMinute: row.rideRateMinorPerMinute, pauseRateMinorPerMinute: row.pauseRateMinorPerMinute, currency: row.currency, billingPolicy: row.billingPolicy, zoneVersion: row.zoneSnapshot.version };
}
export async function tripResult(tx: Transaction, row: RentalRow, time: Date): Promise<TripResult> {
  const intervals = await tx.select().from(tripIntervals).where(eq(tripIntervals.rentalId, row.id)).orderBy(tripIntervals.ordinal);
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.rentalId, row.id));
  if (row.state === 'finished' && !invoice) throw new ReservationUnavailableError();
  return { trip: tripDto(row, intervals, time), invoice: invoice ? invoiceDto(invoice) : null };
}
