import { describe, expect, it } from 'vitest';
import type { ServiceZone } from '@samokettik/contracts';
import { calculateFare, sumIntervals } from '../../apps/server/src/modules/trips/billing.js';
import { isWithinZone, validateZoneRings } from '../../apps/server/src/modules/trips/geofence.js';
import { loadBusinessConfig, parseBusinessConfig } from '../../apps/server/src/config/business.js';

describe('ceil-per-mode-v1 billing in minor units', () => {
  it.each([
    [0n, 0n, 0n], [1n, 0n, 800n], [59999n, 0n, 800n], [60000n, 0n, 800n], [60001n, 0n, 1600n],
    [0n, 1n, 200n], [60000n, 60000n, 1000n], [61000n, 10000n, 1800n], [60000n, 60001n, 1200n],
  ])('active=%s ms paused=%s ms produces %s tyiyn', (active, paused, expected) => {
    expect(calculateFare(active, paused, 800, 200).totalMinor).toBe(expected);
  });
  it('uses integer arithmetic for very large and one-tyiyn rates', () => {
    expect(calculateFare(60001n, 1n, 1, 1).totalMinor).toBe(3n);
    expect(calculateFare(600000000000000n, 0n, 1000000, 0).totalMinor).toBe(10000000000000000n);
    expect(() => calculateFare(9223372036854775808n, 0n, 0, 0)).toThrow('bigint');
    expect(() => calculateFare(-1n, 0n, 800, 200)).toThrow();
    expect(() => calculateFare(1n, 0n, 0.1, 200)).toThrow();
  });
  it('aggregates fragmented mode intervals before rounding and permits same-ms transitions', () => {
    const start = new Date(0), end = new Date(60001);
    const duration = sumIntervals([
      { mode: 'riding', startedAt: start, endedAt: new Date(30000) },
      { mode: 'paused', startedAt: new Date(30000), endedAt: new Date(30001) },
      { mode: 'riding', startedAt: new Date(30001), endedAt: new Date(60001) },
      { mode: 'paused', startedAt: new Date(60001), endedAt: end },
    ], start, end);
    expect(duration).toEqual({ activeMs: 60000n, pausedMs: 1n });
    expect(calculateFare(duration.activeMs, duration.pausedMs, 800, 200).totalMinor).toBe(1000n);
    expect(() => sumIntervals([{ mode: 'riding', startedAt: new Date(1), endedAt: end }], start, end)).toThrow('Non-contiguous');
    expect(() => sumIntervals([{ mode: 'riding', startedAt: start, endedAt: null }], start, new Date(-1))).toThrow();
  });
});

const polygon: ServiceZone = { version: 'test-v1', source: 'test fixture', retrievedAt: 'test', attribution: 'test', geometry: { type: 'Polygon', coordinates: [
  [[0, 0], [4, 0], [4, 4], [2, 2], [0, 4], [0, 0]],
  [[1, 1], [1.5, 1], [1.5, 1.5], [1, 1.5], [1, 1]],
] } };
describe('server geofence covers polygon boundaries, holes and multiple islands', () => {
  it.each([
    [0, 0, true], [2, 0, true], [2, -0.0000001, false], [2, 0.0000001, true],
    [4, 2, true], [4.0000001, 2, false], [1.25, 1.25, false], [1, 1.25, true],
    [2, 3.5, false], [2, 2, true], [0.5, 0.5, true],
  ])('longitude=%s latitude=%s covered=%s', (lng, lat, expected) => {
    expect(isWithinZone(polygon, Math.round(lng * 1e7), Math.round(lat * 1e7))).toBe(expected);
  });
  it('supports multiple polygons and validates closed non-degenerate rings', () => {
    const multi: ServiceZone = { ...polygon, geometry: { type: 'MultiPolygon', coordinates: [polygon.geometry.type === 'Polygon' ? polygon.geometry.coordinates : [], [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]]] } };
    expect(isWithinZone(multi, 105000000, 105000000)).toBe(true);
    expect(isWithinZone(multi, 70000000, 70000000)).toBe(false);
    expect(isWithinZone(multi, NaN, 0)).toBe(false);
    expect(() => validateZoneRings({ ...polygon, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [2, 2]]] } })).toThrow('closed');
    const config = loadBusinessConfig();
    expect(config.seedLocations.every(point => isWithinZone(config.serviceZone, point.longitudeE7, point.latitudeE7))).toBe(true);
    expect(() => parseBusinessConfig({ ...config, billingPolicy: 'unknown' })).toThrow();
  });
});
