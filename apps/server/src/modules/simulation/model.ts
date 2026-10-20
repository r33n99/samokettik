export type RoutePoint = { longitudeE7: number; latitudeE7: number; distanceToNextMm: number };
export type SimulationRoute = RoutePoint[];
export type SimulationState = { lastAt: Date; batteryRemainder: number; distanceMm: bigint; distanceRemainder: number; rideDrainBpPerMinute: number; pauseDrainBpPerMinute: number; speedMmPerMinute: number };
const MINUTE = 60000n;
function distanceMm(a: { longitudeE7: number; latitudeE7: number }, b: { longitudeE7: number; latitudeE7: number }): number {
  const rad = Math.PI / 180, lat1 = a.latitudeE7 / 1e7 * rad, lat2 = b.latitudeE7 / 1e7 * rad;
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((b.longitudeE7 - a.longitudeE7) / 1e7 * rad / 2) ** 2;
  return Math.max(1, Math.round(6371000000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))));
}
export function buildRoute(longitudeE7: number, latitudeE7: number, side: number): SimulationRoute {
  const dx = longitudeE7 + side <= 1800000000 ? side : -side;
  const dy = latitudeE7 + side <= 900000000 ? side : -side;
  const points = [
    { longitudeE7, latitudeE7 }, { longitudeE7: longitudeE7 + dx, latitudeE7 },
    { longitudeE7: longitudeE7 + dx, latitudeE7: latitudeE7 + dy }, { longitudeE7, latitudeE7: latitudeE7 + dy },
  ];
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    if (!next) throw new Error('Invalid route');
    return { ...point, distanceToNextMm: distanceMm(point, next) };
  });
}
export function positionAt(route: SimulationRoute, distance: bigint): { longitudeE7: number; latitudeE7: number } {
  if (route.length < 2 || route.some(point => !Number.isSafeInteger(point.distanceToNextMm) || point.distanceToNextMm < 1)) throw new Error('Invalid simulation route');
  const length = route.reduce((sum, point) => sum + BigInt(point.distanceToNextMm), 0n);
  let remaining = distance % length;
  for (const [index, point] of route.entries()) {
    const edge = BigInt(point.distanceToNextMm), next = route[(index + 1) % route.length];
    if (!next) throw new Error('Invalid route');
    if (remaining < edge) {
      // Floating point is used only for GPS interpolation; charge/money use integers.
      const ratio = Number(remaining) / point.distanceToNextMm;
      return { longitudeE7: Math.round(point.longitudeE7 + (next.longitudeE7 - point.longitudeE7) * ratio), latitudeE7: Math.round(point.latitudeE7 + (next.latitudeE7 - point.latitudeE7) * ratio) };
    }
    remaining -= edge;
  }
  throw new Error('Invalid route distance');
}
export function advanceSimulation(state: SimulationState, batteryBp: number, mode: 'riding' | 'paused', time: Date) {
  if (time < state.lastAt || !Number.isInteger(batteryBp) || batteryBp < 0 || batteryBp > 10000) throw new Error('Invalid simulation time or battery');
  const rate = BigInt(mode === 'riding' ? state.rideDrainBpPerMinute : state.pauseDrainBpPerMinute);
  const remaining = BigInt(batteryBp) * MINUTE - BigInt(state.batteryRemainder);
  const elapsed = BigInt(time.getTime() - state.lastAt.getTime());
  const untilEmpty = remaining <= 0n ? 0n : (remaining + rate - 1n) / rate;
  const depleted = elapsed >= untilEmpty;
  const duration = depleted ? untilEmpty : elapsed;
  const consumed = BigInt(state.batteryRemainder) + duration * rate;
  const movement = mode === 'riding' ? BigInt(state.distanceRemainder) + duration * BigInt(state.speedMmPerMinute) : BigInt(state.distanceRemainder);
  const lastAt = new Date(state.lastAt.getTime() + Number(duration));
  return { lastAt, batteryBp: depleted ? 0 : batteryBp - Number(consumed / MINUTE), batteryRemainder: depleted ? 0 : Number(consumed % MINUTE),
    distanceMm: state.distanceMm + movement / MINUTE, distanceRemainder: Number(movement % MINUTE), depletionAt: depleted ? lastAt : null };
}
