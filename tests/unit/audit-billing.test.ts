import { describe, expect, it } from "vitest";
import {
  calculateFare,
  sumIntervals,
  type TimedInterval,
} from "../../apps/server/src/modules/trips/billing.js";

// Independent oracle: charge each started minute by subtraction, rather than
// reproducing the implementation's ceil division formula.
function oracle(milliseconds: bigint, rate: number): bigint {
  let amount = 0n;
  while (milliseconds > 0n) {
    amount += BigInt(rate);
    milliseconds -= 60000n;
  }
  return amount;
}
describe("audit: billing invariants and independent money oracle", () => {
  it("matches independent minute charging at every boundary for both modes and integer tariffs", () => {
    const times = [
      0n,
      1n,
      59999n,
      60000n,
      60001n,
      119999n,
      120000n,
      120001n,
      180000n,
      180001n,
    ];
    for (const active of times)
      for (const paused of times)
        for (const [ride, pause] of [
          [800, 200],
          [1, 3],
          [0, 0],
        ] as const) {
          expect(calculateFare(active, paused, ride, pause).totalMinor).toBe(
            oracle(active, ride) + oracle(paused, pause),
          );
        }
  });
  it("preserves the price when elapsed modes are fragmented into many intervals", () => {
    for (let variant = 1; variant <= 30; variant++) {
      const intervals: TimedInterval[] = [];
      let cursor = 0,
        active = 0n,
        paused = 0n;
      for (let index = 0; index < 20; index++) {
        const duration = (variant * 7919 + index * 173) % 60001;
        const mode = index % 2 ? ("paused" as const) : ("riding" as const);
        intervals.push({
          mode,
          startedAt: new Date(cursor),
          endedAt: new Date(cursor + duration),
        });
        cursor += duration;
        if (mode === "riding") active += BigInt(duration);
        else paused += BigInt(duration);
      }
      const summed = sumIntervals(intervals, new Date(0), new Date(cursor));
      expect(summed).toEqual({ activeMs: active, pausedMs: paused });
      expect(
        calculateFare(summed.activeMs, summed.pausedMs, 800, 200).totalMinor,
      ).toBe(oracle(active, 800) + oracle(paused, 200));
    }
  });
});
