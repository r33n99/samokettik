import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { projectRoot } from './paths.js';

const BusinessConfigSchema = Type.Object({
  productName: Type.String({ minLength: 1 }),
  city: Type.String({ minLength: 1 }),
  timezone: Type.Literal('Asia/Bishkek'),
  currency: Type.Literal('KGS'),
  locales: Type.Array(Type.Union([Type.Literal('ru'), Type.Literal('ky')]), { minItems: 2, maxItems: 2, uniqueItems: true }),
  defaultLocale: Type.Union([Type.Literal('ru'), Type.Literal('ky')]),
  rideRateMinorPerMinute: Type.Integer({ minimum: 0 }),
  pauseRateMinorPerMinute: Type.Integer({ minimum: 0 }),
  reservationDurationSeconds: Type.Integer({ minimum: 1 }),
  reservationWarningBeforeSeconds: Type.Integer({ minimum: 1 }),
  minRentalBatteryBp: Type.Integer({ minimum: 0, maximum: 10000 }),
  simulationTickMs: Type.Integer({ minimum: 1 }),
  fleetSize: Type.Integer({ minimum: 1, maximum: 1000 }),
  seedOrigin: Type.Object({ latitudeE7: Type.Integer({ minimum: -900000000, maximum: 900000000 }), longitudeE7: Type.Integer({ minimum: -1800000000, maximum: 1800000000 }) }, { additionalProperties: false }),
  seedSpacingE7: Type.Integer({ minimum: 1, maximum: 100000 }),
}, { additionalProperties: false });
export type BusinessConfig = Static<typeof BusinessConfigSchema>;

export function parseBusinessConfig(candidate: unknown): BusinessConfig {
  if (!Value.Check(BusinessConfigSchema, candidate)) throw new Error('Invalid config/demo.json: check required fields and ranges');
  if (candidate.reservationWarningBeforeSeconds >= candidate.reservationDurationSeconds) throw new Error('Reservation warning must precede expiry');
  if (!candidate.locales.includes(candidate.defaultLocale)) throw new Error('Default locale must be supported');
  return candidate;
}
export function loadBusinessConfig(): BusinessConfig {
  const candidate: unknown = JSON.parse(readFileSync(path.join(projectRoot, 'config/demo.json'), 'utf8'));
  return parseBusinessConfig(candidate);
}
export function configHash(config: BusinessConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}
