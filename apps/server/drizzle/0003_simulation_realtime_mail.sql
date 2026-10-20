CREATE TABLE "local_mailbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"recipient" varchar(254) NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "local_mailbox_invoice_id_unique" UNIQUE("invoice_id")
);
--> statement-breakpoint
CREATE TABLE "mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"recipient" varchar(254) NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "mail_outbox_invoice_id_unique" UNIQUE("invoice_id"),
	CONSTRAINT "mail_outbox_identity" UNIQUE("id","invoice_id"),
	CONSTRAINT "mail_outbox_delivery_time" CHECK ("mail_outbox"."delivered_at" IS NULL OR "mail_outbox"."delivered_at" >= "mail_outbox"."created_at")
);
--> statement-breakpoint
CREATE TABLE "realtime_tickets" (
	"hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_simulations" (
	"rental_id" uuid PRIMARY KEY NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"distance_mm" bigint DEFAULT 0 NOT NULL,
	"distance_remainder" integer DEFAULT 0 NOT NULL,
	"ride_drain_bp_per_minute" integer NOT NULL,
	"pause_drain_bp_per_minute" integer NOT NULL,
	"speed_mm_per_minute" integer NOT NULL,
	"tick_ms" integer NOT NULL,
	"route" jsonb NOT NULL,
	CONSTRAINT "trip_simulations_remainders" CHECK ("trip_simulations"."distance_remainder" BETWEEN 0 AND 59999 AND "trip_simulations"."distance_mm" >= 0),
	CONSTRAINT "trip_simulations_rates" CHECK ("trip_simulations"."ride_drain_bp_per_minute" BETWEEN 1 AND 10000000 AND "trip_simulations"."pause_drain_bp_per_minute" BETWEEN 1 AND 10000000 AND "trip_simulations"."speed_mm_per_minute" BETWEEN 0 AND 10000000 AND "trip_simulations"."tick_ms" BETWEEN 100 AND 60000)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_code_supported";--> statement-breakpoint
ALTER TABLE "rentals" DROP CONSTRAINT "rentals_terminal_state";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "reason" varchar(32);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "battery_remainder" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "local_mailbox" ADD CONSTRAINT "local_mailbox_logical_event_fk" FOREIGN KEY ("id","invoice_id") REFERENCES "public"."mail_outbox"("id","invoice_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_tickets" ADD CONSTRAINT "realtime_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_simulations" ADD CONSTRAINT "trip_simulations_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_outbox_pending" ON "mail_outbox" USING btree ("created_at") WHERE "mail_outbox"."delivered_at" IS NULL;--> statement-breakpoint
CREATE INDEX "realtime_tickets_expiry" ON "realtime_tickets" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "trip_simulations_due" ON "trip_simulations" USING btree ("last_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deadline_reason" CHECK (("notifications"."code" = 'TRIP_FINISHED' AND "notifications"."expires_at" IS NULL AND "notifications"."reason" IS NOT NULL AND "notifications"."reason" IN ('finished_by_user', 'battery_depleted')) OR ("notifications"."code" <> 'TRIP_FINISHED' AND "notifications"."expires_at" IS NOT NULL AND "notifications"."reason" IS NULL));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_code_supported" CHECK ("notifications"."code" IN ('RESERVATION_EXPIRING', 'RESERVATION_EXPIRED', 'RESERVATION_UNAVAILABLE', 'TRIP_FINISHED'));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_terminal_state" CHECK ((
    ("rentals"."state" IN ('reserved', 'riding', 'paused') AND "rentals"."ended_at" IS NULL AND "rentals"."end_reason" IS NULL) OR
    ("rentals"."state" = 'expired' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."end_reason" IS NOT NULL AND "rentals"."ended_at" = "rentals"."expires_at" AND "rentals"."end_reason" = 'reservation_expired') OR
    ("rentals"."state" = 'cancelled' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."ended_at" >= "rentals"."reserved_at"
      AND "rentals"."end_reason" IS NOT NULL AND "rentals"."end_reason" IN ('cancelled_by_user', 'battery_too_low', 'vehicle_unavailable')) OR
    ("rentals"."state" = 'finished' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."started_at" IS NOT NULL AND "rentals"."ended_at" >= "rentals"."started_at" AND "rentals"."end_reason" IS NOT NULL AND "rentals"."end_reason" IN ('finished_by_user', 'battery_depleted'))
  ));--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_battery_fraction" CHECK ("vehicles"."battery_remainder" BETWEEN 0 AND 59999 AND ("vehicles"."battery_bp" > 0 OR "vehicles"."battery_remainder" = 0));
--> statement-breakpoint
-- Notifications are hints after COMMIT, not durable delivery or client state.
CREATE FUNCTION samokettik_notify_changes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify('samokettik_changes', 'state'); RETURN NULL; END $$;
--> statement-breakpoint
CREATE TRIGGER vehicles_notify_changes AFTER INSERT OR UPDATE OR DELETE ON vehicles FOR EACH STATEMENT EXECUTE FUNCTION samokettik_notify_changes();
--> statement-breakpoint
CREATE TRIGGER rentals_notify_changes AFTER INSERT OR UPDATE OR DELETE ON rentals FOR EACH STATEMENT EXECUTE FUNCTION samokettik_notify_changes();
--> statement-breakpoint
CREATE TRIGGER notifications_notify_changes AFTER INSERT OR UPDATE OR DELETE ON notifications FOR EACH STATEMENT EXECUTE FUNCTION samokettik_notify_changes();
--> statement-breakpoint
CREATE TRIGGER invoices_notify_changes AFTER INSERT OR UPDATE OR DELETE ON invoices FOR EACH STATEMENT EXECUTE FUNCTION samokettik_notify_changes();
--> statement-breakpoint
CREATE TRIGGER demo_payments_notify_changes AFTER INSERT OR UPDATE OR DELETE ON demo_payments FOR EACH STATEMENT EXECUTE FUNCTION samokettik_notify_changes();
--> statement-breakpoint
CREATE TRIGGER local_mailbox_notify_changes AFTER INSERT OR UPDATE OR DELETE ON local_mailbox FOR EACH STATEMENT EXECUTE FUNCTION samokettik_notify_changes();
--> statement-breakpoint
UPDATE app_metadata SET schema_version=4 WHERE id=1;
