import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
loadEnvFile('.env');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
try {
  const base = `http://127.0.0.1:${process.env.WEB_PORT ?? '5173'}`;
  const ready = await fetch(base + '/health/ready').then(response => response.json());
  assert.equal(ready.schemaVersion, 3);
  const zone = await fetch(base + '/api/v1/service-zone').then(response => response.json());
  assert.equal(zone.geometry.type, 'MultiPolygon');
  assert.equal(zone.geometry.coordinates.length, 4);
  const result = await pool.query(`SELECT r.id AS rental_id, r.state, v.public_code, i.status AS invoice_status, i.total_minor::text,
    i.active_ms::text, i.paused_ms::text, i.active_minutes::text, i.paused_minutes::text,
    r.billing_policy, r.zone_snapshot->>'version' AS zone_version, i.currency,
    i.active_ms = (SELECT coalesce(sum(extract(epoch FROM (t.ended_at-t.started_at))*1000),0)::bigint FROM trip_intervals t WHERE t.rental_id=r.id AND t.mode='riding') AS active_ms_match,
    i.paused_ms = (SELECT coalesce(sum(extract(epoch FROM (t.ended_at-t.started_at))*1000),0)::bigint FROM trip_intervals t WHERE t.rental_id=r.id AND t.mode='paused') AS paused_ms_match,
    (SELECT count(*)::int FROM demo_payments p WHERE p.invoice_id=i.id) AS receipt_count,
    (SELECT count(*)::int FROM trip_intervals t WHERE t.rental_id=r.id AND t.ended_at IS NULL) AS open_intervals
    FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id JOIN invoices i ON i.rental_id=r.id
    WHERE r.user_id=$1 ORDER BY i.created_at DESC LIMIT 1`, ['20000000-0000-4000-8000-000000000001']);
  const row = result.rows[0];
  assert.ok(row);
  assert.equal(row.state, 'finished'); assert.equal(row.invoice_status, 'paid');
  assert.equal(row.receipt_count, 1); assert.equal(row.open_intervals, 0);
  assert.equal(row.active_ms_match, true); assert.equal(row.paused_ms_match, true);
  assert.equal(row.total_minor, '1000');
  const report = { recordedAt: new Date(Date.now()+6*3600000).toISOString().replace('Z','+06:00'), readiness: ready, zone: { version: zone.version, source: zone.source, parts: zone.geometry.coordinates.length }, persistedDemoTrip: row };
  await mkdir('docs/evidence/trips', { recursive: true });
  await writeFile('docs/evidence/trips/live-database.json', JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await pool.end(); }
