import type { BusinessConfig } from '../config/business.js';
import { users, vehicles } from './schema.js';
import { DEMO_USER_IDS } from '../config/demo-identities.js';

export function demoVehicles(config: BusinessConfig): (typeof vehicles.$inferInsert & { id: string })[] {
  return config.seedLocations.map((point, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    publicCode: `SK-${String(index + 1).padStart(3, '0')}`,
    serviceMode: index === 3 ? 'maintenance' : 'operational',
    batteryBp: index === 0 ? 0 : index === 1 ? Math.max(0, config.minRentalBatteryBp - 1) : index === 2 ? config.minRentalBatteryBp : Math.max(config.minRentalBatteryBp, 10000 - index * 173),
    latitudeE7: point.latitudeE7,
    longitudeE7: point.longitudeE7,
  }));
}

export const demoUsers: (typeof users.$inferInsert)[] = [
  { id: DEMO_USER_IDS.ru, emailNormalized: 'demo.ru@example.test', locale: 'ru' },
  { id: DEMO_USER_IDS.ky, emailNormalized: 'demo.ky@example.test', locale: 'ky' },
];
