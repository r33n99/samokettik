import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
loadEnvFile('.env');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
try {
  const readyResponse = await fetch(`http://127.0.0.1:${process.env.WEB_PORT ?? '5173'}/health/ready`);
  assert.equal(readyResponse.status, 200);
  const ready = await readyResponse.json(); assert.equal(ready.schemaVersion, 4);
  const { rows: [row] } = await pool.query(`SELECT r.state, r.end_reason, v.public_code, v.battery_bp, v.battery_remainder,
    i.status AS invoice_status, i.total_minor::text, i.active_ms::text, i.paused_ms::text,
    i.active_minutes::text, i.paused_minutes::text, s.distance_mm::text,
    s.tick_ms, s.ride_drain_bp_per_minute, s.pause_drain_bp_per_minute,
    i.active_ms = (SELECT coalesce(sum(extract(epoch FROM (t.ended_at-t.started_at))*1000),0)::bigint FROM trip_intervals t WHERE t.rental_id=r.id AND t.mode='riding') AS active_ms_match,
    i.paused_ms = (SELECT coalesce(sum(extract(epoch FROM (t.ended_at-t.started_at))*1000),0)::bigint FROM trip_intervals t WHERE t.rental_id=r.id AND t.mode='paused') AS paused_ms_match,
    (SELECT count(*)::int FROM trip_intervals t WHERE t.rental_id=r.id AND t.ended_at IS NULL) AS open_intervals,
    (SELECT count(*)::int FROM notifications n WHERE n.rental_id=r.id AND n.code='TRIP_FINISHED') AS finish_notifications,
    (SELECT count(*)::int FROM mail_outbox o WHERE o.invoice_id=i.id) AS outbox_count,
    (SELECT count(*)::int FROM mail_outbox o WHERE o.invoice_id=i.id AND o.delivered_at IS NOT NULL) AS acknowledged_count,
    (SELECT count(*)::int FROM local_mailbox m WHERE m.invoice_id=i.id) AS mailbox_count
    FROM rentals r JOIN vehicles v ON v.id=r.vehicle_id JOIN invoices i ON i.rental_id=r.id
    JOIN trip_simulations s ON s.rental_id=r.id
    WHERE r.user_id=$1 ORDER BY i.created_at DESC LIMIT 1`, ['20000000-0000-4000-8000-000000000001']);
  assert.ok(row); assert.equal(row.state,'finished'); assert.equal(row.end_reason,'finished_by_user');
  assert.equal(row.total_minor,'1000'); assert.equal(row.invoice_status,'unpaid');
  assert.equal(row.active_ms_match,true); assert.equal(row.paused_ms_match,true);
  assert.equal(row.open_intervals,0); assert.equal(row.finish_notifications,1);
  assert.equal(row.outbox_count,1); assert.equal(row.acknowledged_count,1); assert.equal(row.mailbox_count,1);
  assert.equal(row.tick_ms,3000); assert.ok(BigInt(row.distance_mm)>0n); assert.ok(row.battery_bp<1500);
  const report={recordedAt:new Date(Date.now()+6*3600000).toISOString().replace('Z','+06:00'),readiness:ready,persistedDemoTrip:row};
  await mkdir('docs/evidence/realtime',{recursive:true});
  await writeFile('docs/evidence/realtime/live-database.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await pool.end(); }
