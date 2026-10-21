import { describe, expect, it } from 'vitest';
import { loadBusinessConfig, parseBusinessConfig } from '../../apps/server/src/config/business.js';
import { demoVehicles } from '../../apps/server/src/db/fixtures.js';
import { isWithinZone } from '../../apps/server/src/modules/trips/geofence.js';

describe('demo fleet distribution', () => {
  const config = loadBusinessConfig();
  it('spreads unique coordinates across the service zone, including every separate polygon', () => {
    const points = demoVehicles(config);
    expect(points).toHaveLength(30);
    expect(new Set(points.map(p => `${p.longitudeE7}:${p.latitudeE7}`)).size).toBe(points.length);
    expect(points.every(p => isWithinZone(config.serviceZone, p.longitudeE7, p.latitudeE7))).toBe(true);
    const geometry = config.serviceZone.geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      const zone = { ...config.serviceZone, geometry: { type: 'Polygon' as const, coordinates: polygon } };
      expect(points.some(p => isWithinZone(zone, p.longitudeE7, p.latitudeE7))).toBe(true);
    }
    expect(Math.max(...points.map(p => p.latitudeE7)) - Math.min(...points.map(p => p.latitudeE7))).toBeGreaterThan(2500000);
    expect(Math.max(...points.map(p => p.longitudeE7)) - Math.min(...points.map(p => p.longitudeE7))).toBeGreaterThan(2300000);
  });
  it('rejects incomplete, duplicate and out-of-zone seed configuration', () => {
    expect(() => parseBusinessConfig({ ...config, seedLocations: config.seedLocations.slice(1) })).toThrow('match fleet size');
    expect(() => parseBusinessConfig({ ...config, seedLocations: config.seedLocations.map(() => config.seedLocations[0]) })).toThrow();
    expect(() => parseBusinessConfig({ ...config, seedLocations: [{ longitudeE7: 0, latitudeE7: 0 }, ...config.seedLocations.slice(1)] })).toThrow('inside the service zone');
  });
});
