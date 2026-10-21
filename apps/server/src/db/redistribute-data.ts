import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BusinessConfig } from '../config/business.js';
import type { Database } from './client.js';
import { demoVehicles } from './fixtures.js';
import { rentals, vehicles } from './schema.js';

// Explicit demo maintenance, never called by seed or normal server startup.
export async function redistributeDemoVehicles(database: Database, config: BusinessConfig) {
  const targets = demoVehicles(config);
  return database.db.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    // Reservation/start/finish also lock the vehicle before changing rentals.
    // Read active rentals in a separate statement AFTER all locks are acquired:
    // READ COMMITTED must see bookings committed while this command was waiting.
    const rows = await tx.select().from(vehicles)
      .where(inArray(vehicles.id, targets.map(row => row.id)))
      .orderBy(vehicles.id).for('update');
    const active = await tx.select({ vehicleId: rentals.vehicleId }).from(rentals)
      .where(and(inArray(rentals.vehicleId, rows.map(row => row.id)), inArray(rentals.state, ['reserved', 'riding', 'paused'])));
    const occupied = new Set(active.map(row => row.vehicleId));
    let moved = 0;
    for (const row of rows) {
      if (occupied.has(row.id)) continue;
      const target = targets.find(target => target.id === row.id && target.publicCode === row.publicCode);
      if (!target || (row.latitudeE7 === target.latitudeE7 && row.longitudeE7 === target.longitudeE7)) continue;
      await tx.update(vehicles).set({ latitudeE7: target.latitudeE7, longitudeE7: target.longitudeE7, version: sql`${vehicles.version} + 1` }).where(eq(vehicles.id, row.id));
      moved++;
    }
    return { moved, skippedActive: occupied.size, missing: targets.length - rows.length };
  }, { isolationLevel: 'read committed' });
}
