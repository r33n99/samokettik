import { describe, expect, it } from 'vitest';
import { advanceSimulation, buildRoute, positionAt, type SimulationState } from '../../apps/server/src/modules/simulation/model.js';
import { hasMinimumBattery } from '../../apps/server/src/modules/simulation/battery.js';
const origin = new Date('2026-01-01T00:00:00.000Z');
const initial: SimulationState = { lastAt: origin, batteryRemainder: 0, distanceMm: 0n, distanceRemainder: 0, rideDrainBpPerMinute: 100, pauseDrainBpPerMinute: 20, speedMmPerMinute: 180000 };
describe('elapsed-time integer transport simulation', () => {
  it('checks the real fractional battery at the rental threshold', () => {
    expect(hasMinimumBattery({ batteryBp: 1500, batteryRemainder: 0 }, 1500)).toBe(true);
    expect(hasMinimumBattery({ batteryBp: 1500, batteryRemainder: 1 }, 1500)).toBe(false);
    expect(hasMinimumBattery({ batteryBp: 1501, batteryRemainder: 59999 }, 1500)).toBe(true);
  });
  it('matches one delayed minute with twenty 3-second cycles', () => {
    const delayed = advanceSimulation(initial, 1500, 'riding', new Date(origin.getTime() + 60000));
    let state = initial, battery = 1500;
    for (let i = 1; i <= 20; i++) {
      const next = advanceSimulation(state, battery, 'riding', new Date(origin.getTime() + i * 3000));
      state = { ...state, ...next }; battery = next.batteryBp;
    }
    expect(battery).toBe(1400);
    expect(delayed).toMatchObject({ batteryBp: battery, distanceMm: state.distanceMm, distanceRemainder: state.distanceRemainder, batteryRemainder: state.batteryRemainder, depletionAt: null });
    expect(delayed.distanceMm).toBe(180000n);
  });
  it('carries fractional charge and distance across short ticks and pause/resume', () => {
    const one = advanceSimulation(initial, 1500, 'riding', new Date(origin.getTime() + 1));
    expect(one.batteryBp).toBe(1500);
    expect(one.batteryRemainder).toBe(100);
    const pause = advanceSimulation({ ...initial, ...one }, one.batteryBp, 'paused', new Date(origin.getTime() + 60001));
    expect(pause.distanceMm).toBe(one.distanceMm);
    expect(pause.distanceRemainder).toBe(one.distanceRemainder);
    expect(pause.batteryBp).toBe(1480);
    expect(pause.batteryRemainder).toBe(100);
    const resume = advanceSimulation({ ...initial, ...pause }, pause.batteryBp, 'riding', new Date(origin.getTime() + 120001));
    expect(resume.batteryBp).toBe(1380);
    expect(resume.distanceMm).toBe(one.distanceMm + 180000n);
  });
  it('stops at the exact depletion millisecond, including a long outage and a fractional bp', () => {
    const depleted = advanceSimulation({ ...initial, batteryRemainder: 1, rideDrainBpPerMinute: 37 }, 1, 'riding', new Date(origin.getTime() + 999999));
    expect(depleted.lastAt.getTime() - origin.getTime()).toBe(1622);
    expect(depleted.depletionAt).toEqual(depleted.lastAt);
    expect(depleted.batteryBp).toBe(0);
    expect(depleted.batteryRemainder).toBe(0);
    expect(depleted.distanceMm).toBe(4866n);
    const paused = advanceSimulation(initial, 1, 'paused', new Date(origin.getTime() + 999999));
    expect(paused.lastAt.getTime() - origin.getTime()).toBe(3000);
    expect(paused.distanceMm).toBe(0n);
    expect(advanceSimulation(initial, 0, 'riding', origin).depletionAt).toEqual(origin);
    expect(() => advanceSimulation(initial, 1000, 'riding', new Date(origin.getTime() - 1))).toThrow();
  });
  it('follows a saved closed route without accumulating GPS drift over laps', () => {
    const route = buildRoute(746020000, 428740000, 6000);
    const length = route.reduce((sum, point) => sum + BigInt(point.distanceToNextMm), 0n);
    expect(positionAt(route, 0n)).toEqual({ longitudeE7: 746020000, latitudeE7: 428740000 });
    expect(positionAt(route, length * 1000000000000n)).toEqual(positionAt(route, 0n));
    expect(positionAt(route, BigInt(route[0]!.distanceToNextMm))).toEqual({ longitudeE7: 746026000, latitudeE7: 428740000 });
    expect(positionAt(buildRoute(1800000000, 900000000, 6000), 1000n).longitudeE7).toBeLessThanOrEqual(1800000000);
  });
});
