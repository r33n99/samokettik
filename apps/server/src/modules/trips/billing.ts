export const BILLING_POLICY = 'ceil-per-mode-v1' as const;
const MINUTE_MS = 60000n;
const POSTGRES_BIGINT_MAX = 9223372036854775807n;
export function calculateFare(activeMs: bigint, pausedMs: bigint, rideRate: number, pauseRate: number) {
  if (activeMs < 0n || pausedMs < 0n || !Number.isSafeInteger(rideRate) || rideRate < 0 || !Number.isSafeInteger(pauseRate) || pauseRate < 0) throw new Error('Invalid billing inputs');
  const activeMinutes = (activeMs + MINUTE_MS - 1n) / MINUTE_MS;
  const pausedMinutes = (pausedMs + MINUTE_MS - 1n) / MINUTE_MS;
  const totalMinor = activeMinutes * BigInt(rideRate) + pausedMinutes * BigInt(pauseRate);
  if (totalMinor > POSTGRES_BIGINT_MAX || activeMs > POSTGRES_BIGINT_MAX || pausedMs > POSTGRES_BIGINT_MAX) throw new Error('Billing amount exceeds PostgreSQL bigint');
  return { activeMs, pausedMs, activeMinutes, pausedMinutes, totalMinor };
}
export type Fare = ReturnType<typeof calculateFare>;
export type TimedInterval = { mode: 'riding' | 'paused'; startedAt: Date; endedAt: Date | null };
export function sumIntervals(intervals: readonly TimedInterval[], startedAt: Date, time: Date): { activeMs: bigint; pausedMs: bigint } {
  let cursor = startedAt.getTime(), activeMs = 0n, pausedMs = 0n;
  if (intervals.length === 0) throw new Error('Trip has no intervals');
  for (const [index, interval] of intervals.entries()) {
    const start = interval.startedAt.getTime(), end = (interval.endedAt ?? time).getTime();
    if (start !== cursor || end < start || end > time.getTime() || (interval.endedAt === null && index !== intervals.length - 1)) throw new Error('Non-contiguous trip intervals or server clock moved backwards');
    const duration = BigInt(end - start);
    if (interval.mode === 'riding') activeMs += duration;
    else pausedMs += duration;
    cursor = end;
  }
  if (cursor !== time.getTime()) throw new Error('Trip intervals do not cover elapsed time');
  return { activeMs, pausedMs };
}
