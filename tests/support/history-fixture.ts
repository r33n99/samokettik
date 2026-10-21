import type pg from 'pg';
import type { ServiceZone } from '@samokettik/contracts';

/** Bulk fixture only for isolated UUID databases. Never expose through an API. */
export async function seedHistory(pool: pg.Pool, userId: string, vehicleId: string, count: number, zone: ServiceZone) {
  const name = await pool.query<{ name: string }>('SELECT current_database() AS name');
  if (!/^samokettik_test_[a-f0-9]{32}$/.test(name.rows[0]?.name ?? '')) throw new Error('History fixture requires an isolated database');
  const result = await pool.query<{ id: string }>(`
    INSERT INTO rentals (user_id, vehicle_id, state, reserved_at, warn_at, expires_at, started_at, ended_at,
      end_reason, minimum_battery_bp, ride_rate_minor_per_minute, pause_rate_minor_per_minute, currency, billing_policy, zone_snapshot)
    SELECT $1, $2, 'finished', ended - interval '2 seconds', ended + interval '718 seconds', ended + interval '898 seconds',
      ended - interval '1 second', ended, 'finished_by_user', 1500, 800, 200, 'KGS', 'ceil-per-mode-v1', $4::jsonb
    FROM (SELECT timestamptz '2020-01-01 00:00:00+06' + (n / 2) * interval '1 second' + interval '123 microseconds' AS ended
      FROM generate_series(1, $3::int) AS n) AS times RETURNING id`, [userId, vehicleId, count, JSON.stringify(zone)]);
  const ids = result.rows.map(row => row.id);
  await pool.query(`INSERT INTO trip_intervals (rental_id, ordinal, mode, started_at, ended_at)
    SELECT id, 0, 'riding', started_at, ended_at FROM rentals WHERE id = ANY($1::uuid[])`, [ids]);
  await pool.query(`INSERT INTO invoices (rental_id, user_id, currency, billing_policy, ride_rate_minor_per_minute,
    pause_rate_minor_per_minute, active_ms, paused_ms, active_minutes, paused_minutes, total_minor, created_at)
    SELECT id, user_id, 'KGS', 'ceil-per-mode-v1', 800, 200, 1000, 0, 1, 0, 800, ended_at
    FROM rentals WHERE id = ANY($1::uuid[])`, [ids]);
  return ids;
}
