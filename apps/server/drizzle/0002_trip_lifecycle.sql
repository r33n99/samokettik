CREATE TABLE "demo_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"provider" varchar(16) DEFAULT 'demo' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "demo_payments_invoice_id_unique" UNIQUE("invoice_id"),
	CONSTRAINT "demo_payments_provider" CHECK ("demo_payments"."provider" = 'demo')
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"billing_policy" varchar(32) NOT NULL,
	"ride_rate_minor_per_minute" integer NOT NULL,
	"pause_rate_minor_per_minute" integer NOT NULL,
	"active_ms" bigint NOT NULL,
	"paused_ms" bigint NOT NULL,
	"active_minutes" bigint NOT NULL,
	"paused_minutes" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"status" varchar(16) DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "invoices_rental_id_unique" UNIQUE("rental_id"),
	CONSTRAINT "invoices_payment_identity" UNIQUE("id","total_minor","currency"),
	CONSTRAINT "invoices_currency_policy" CHECK ("invoices"."currency" = 'KGS' AND "invoices"."billing_policy" = 'ceil-per-mode-v1'),
	CONSTRAINT "invoices_amounts" CHECK ("invoices"."active_ms" >= 0 AND "invoices"."paused_ms" >= 0 AND "invoices"."ride_rate_minor_per_minute" >= 0 AND "invoices"."pause_rate_minor_per_minute" >= 0 AND "invoices"."total_minor" >= 0
    AND "invoices"."active_minutes" = ("invoices"."active_ms" + 59999) / 60000 AND "invoices"."paused_minutes" = ("invoices"."paused_ms" + 59999) / 60000
    AND "invoices"."total_minor" = "invoices"."active_minutes" * "invoices"."ride_rate_minor_per_minute"::bigint + "invoices"."paused_minutes" * "invoices"."pause_rate_minor_per_minute"::bigint),
	CONSTRAINT "invoices_payment_state" CHECK (("invoices"."status" = 'unpaid' AND "invoices"."paid_at" IS NULL) OR ("invoices"."status" = 'paid' AND "invoices"."paid_at" IS NOT NULL AND "invoices"."paid_at" >= "invoices"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "trip_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_id" uuid NOT NULL,
	"mode" varchar(16) NOT NULL,
	"ordinal" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "trip_intervals_order" UNIQUE("rental_id","ordinal"),
	CONSTRAINT "trip_intervals_mode" CHECK ("trip_intervals"."mode" IN ('riding', 'paused')),
	CONSTRAINT "trip_intervals_ordinal" CHECK ("trip_intervals"."ordinal" >= 0),
	CONSTRAINT "trip_intervals_times" CHECK ("trip_intervals"."ended_at" IS NULL OR "trip_intervals"."ended_at" >= "trip_intervals"."started_at")
);
--> statement-breakpoint
ALTER TABLE "rentals" DROP CONSTRAINT "rentals_state_supported";--> statement-breakpoint
ALTER TABLE "rentals" DROP CONSTRAINT "rentals_terminal_state";--> statement-breakpoint
DROP INDEX "rentals_one_active_vehicle";--> statement-breakpoint
DROP INDEX "rentals_one_active_user";--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "ride_rate_minor_per_minute" integer;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "pause_rate_minor_per_minute" integer;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "currency" varchar(3);--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "billing_policy" varchar(32);--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "zone_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "demo_payments" ADD CONSTRAINT "demo_payments_invoice_amount_fk" FOREIGN KEY ("invoice_id","amount_minor","currency") REFERENCES "public"."invoices"("id","total_minor","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rental_owner_fk" FOREIGN KEY ("rental_id","user_id") REFERENCES "public"."rentals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_intervals" ADD CONSTRAINT "trip_intervals_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_owner_history" ON "invoices" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_intervals_one_open" ON "trip_intervals" USING btree ("rental_id") WHERE "trip_intervals"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "trip_intervals_timeline" ON "trip_intervals" USING btree ("rental_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_one_active_vehicle" ON "rentals" USING btree ("vehicle_id") WHERE "rentals"."state" IN ('reserved', 'riding', 'paused');--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_one_active_user" ON "rentals" USING btree ("user_id") WHERE "rentals"."state" IN ('reserved', 'riding', 'paused');--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_trip_snapshot" CHECK ((
    ("rentals"."state" IN ('reserved', 'cancelled', 'expired') AND "rentals"."started_at" IS NULL AND "rentals"."ride_rate_minor_per_minute" IS NULL AND "rentals"."pause_rate_minor_per_minute" IS NULL AND "rentals"."currency" IS NULL AND "rentals"."billing_policy" IS NULL AND "rentals"."zone_snapshot" IS NULL) OR
    ("rentals"."state" IN ('riding', 'paused', 'finished') AND "rentals"."started_at" IS NOT NULL AND "rentals"."started_at" >= "rentals"."reserved_at" AND "rentals"."started_at" < "rentals"."expires_at"
      AND "rentals"."ride_rate_minor_per_minute" IS NOT NULL AND "rentals"."ride_rate_minor_per_minute" >= 0 AND "rentals"."pause_rate_minor_per_minute" IS NOT NULL AND "rentals"."pause_rate_minor_per_minute" >= 0
      AND "rentals"."currency" IS NOT NULL AND "rentals"."currency" = 'KGS' AND "rentals"."billing_policy" IS NOT NULL AND "rentals"."billing_policy" = 'ceil-per-mode-v1' AND "rentals"."zone_snapshot" IS NOT NULL)
  ));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_state_supported" CHECK ("rentals"."state" IN ('reserved', 'cancelled', 'expired', 'riding', 'paused', 'finished'));--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_terminal_state" CHECK ((
    ("rentals"."state" IN ('reserved', 'riding', 'paused') AND "rentals"."ended_at" IS NULL AND "rentals"."end_reason" IS NULL) OR
    ("rentals"."state" = 'expired' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."end_reason" IS NOT NULL AND "rentals"."ended_at" = "rentals"."expires_at" AND "rentals"."end_reason" = 'reservation_expired') OR
    ("rentals"."state" = 'cancelled' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."ended_at" >= "rentals"."reserved_at"
      AND "rentals"."end_reason" IS NOT NULL AND "rentals"."end_reason" IN ('cancelled_by_user', 'battery_too_low', 'vehicle_unavailable')) OR
    ("rentals"."state" = 'finished' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."started_at" IS NOT NULL AND "rentals"."ended_at" >= "rentals"."started_at" AND "rentals"."end_reason" IS NOT NULL AND "rentals"."end_reason" = 'finished_by_user')
  ));
--> statement-breakpoint
-- Drizzle Kit does not represent exclusion constraints. Retain this additive SQL.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE trip_intervals ADD CONSTRAINT trip_intervals_no_overlap EXCLUDE USING gist (rental_id WITH =, tstzrange(started_at, ended_at, '[)') WITH &&);
--> statement-breakpoint
UPDATE app_metadata SET schema_version=3 WHERE id=1;
