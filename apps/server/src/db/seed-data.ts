import type { BusinessConfig } from '../config/business.js';
import type { Database } from './client.js';
import { demoUsers, demoVehicles } from './fixtures.js';
import { users, vehicles } from './schema.js';
export async function seedDatabase(database: Database, config: BusinessConfig): Promise<void> {
  await database.db.transaction(async tx => {
    await tx.insert(users).values(demoUsers).onConflictDoNothing();
    await tx.insert(vehicles).values(demoVehicles(config)).onConflictDoNothing();
  });
}
