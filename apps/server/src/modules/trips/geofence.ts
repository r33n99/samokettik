import type { ServiceZone } from '@samokettik/contracts';

type Point = readonly [number, number];
const e7 = (value: number): bigint => BigInt(Math.round(value * 1e7));
// Integer E7 coordinates match telemetry storage. BigInt prevents cross-product
// overflow and removes floating-point epsilon decisions at vertices and edges.
function ringLocation(longitudeE7: number, latitudeE7: number, ring: readonly Point[]): 'inside' | 'outside' | 'boundary' {
  const px = BigInt(longitudeE7), py = BigInt(latitudeE7);
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if (!a || !b) throw new Error('Invalid service-zone ring');
    const ax = e7(a[0]), ay = e7(a[1]), bx = e7(b[0]), by = e7(b[1]);
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross === 0n && px >= (ax < bx ? ax : bx) && px <= (ax > bx ? ax : bx) && py >= (ay < by ? ay : by) && py <= (ay > by ? ay : by)) return 'boundary';
    if ((ay > py) !== (by > py) && (cross > 0n) === (by > ay)) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}
export function validateZoneRings(zone: ServiceZone): void {
  const polygons = zone.geometry.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) {
    const first = ring[0], last = ring.at(-1);
    if (!first || !last || e7(first[0]) !== e7(last[0]) || e7(first[1]) !== e7(last[1])) throw new Error('Service-zone rings must be closed');
    let area = 0n;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      if (!a || !b) throw new Error('Invalid service-zone ring');
      area += e7(a[0]) * e7(b[1]) - e7(b[0]) * e7(a[1]);
    }
    if (area === 0n) throw new Error('Service-zone ring has no area');
  }
}
export function isWithinZone(zone: ServiceZone, longitudeE7: number, latitudeE7: number): boolean {
  if (!Number.isSafeInteger(longitudeE7) || !Number.isSafeInteger(latitudeE7) || Math.abs(longitudeE7) > 1800000000 || Math.abs(latitudeE7) > 900000000) return false;
  const polygons = zone.geometry.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry.coordinates;
  return polygons.some(polygon => {
    const outer = polygon[0];
    if (!outer) return false;
    const location = ringLocation(longitudeE7, latitudeE7, outer);
    if (location === 'boundary') return true;
    if (location === 'outside') return false;
    for (const hole of polygon.slice(1)) {
      const holeLocation = ringLocation(longitudeE7, latitudeE7, hole);
      if (holeLocation === 'boundary') return true;
      if (holeLocation === 'inside') return false;
    }
    return true;
  });
}
