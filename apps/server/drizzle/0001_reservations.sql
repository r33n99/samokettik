-- Persistent reservations, idempotency, private notifications and worker health.
CREATE TABLE "idempotency_requests" (
	"user_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"operation" varchar(32) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_requests_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "job_heartbeats" (
	"name" varchar(64) PRIMARY KEY NOT NULL,
	"config_hash" varchar(64) NOT NULL,
	"last_success_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_one_logical_event" UNIQUE("rental_id","code"),
	CONSTRAINT "notifications_code_supported" CHECK ("notifications"."code" IN ('RESERVATION_EXPIRING', 'RESERVATION_EXPIRED', 'RESERVATION_UNAVAILABLE'))
);
--> statement-breakpoint
CREATE TABLE "rentals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"state" varchar(16) DEFAULT 'reserved' NOT NULL,
	"reserved_at" timestamp with time zone NOT NULL,
	"warn_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" varchar(32),
	"minimum_battery_bp" integer NOT NULL,
	CONSTRAINT "rentals_id_owner" UNIQUE("id","user_id"),
	CONSTRAINT "rentals_state_supported" CHECK ("rentals"."state" IN ('reserved', 'cancelled', 'expired')),
	CONSTRAINT "rentals_deadlines" CHECK ("rentals"."reserved_at" < "rentals"."warn_at" AND "rentals"."warn_at" < "rentals"."expires_at"),
	CONSTRAINT "rentals_minimum_battery" CHECK ("rentals"."minimum_battery_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "rentals_terminal_state" CHECK ((
    ("rentals"."state" = 'reserved' AND "rentals"."ended_at" IS NULL AND "rentals"."end_reason" IS NULL) OR
    ("rentals"."state" = 'expired' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."end_reason" IS NOT NULL AND "rentals"."ended_at" = "rentals"."expires_at" AND "rentals"."end_reason" = 'reservation_expired') OR
    ("rentals"."state" = 'cancelled' AND "rentals"."ended_at" IS NOT NULL AND "rentals"."ended_at" >= "rentals"."reserved_at"
      AND "rentals"."end_reason" IS NOT NULL AND "rentals"."end_reason" IN ('cancelled_by_user', 'battery_too_low', 'vehicle_unavailable'))
  ))
);
--> statement-breakpoint
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_rental_owner_fk" FOREIGN KEY ("rental_id","user_id") REFERENCES "public"."rentals"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_owner_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_one_active_vehicle" ON "rentals" USING btree ("vehicle_id") WHERE "rentals"."state" = 'reserved';--> statement-breakpoint
CREATE UNIQUE INDEX "rentals_one_active_user" ON "rentals" USING btree ("user_id") WHERE "rentals"."state" = 'reserved';--> statement-breakpoint
CREATE INDEX "rentals_expiry_due" ON "rentals" USING btree ("expires_at") WHERE "rentals"."state" = 'reserved';--> statement-breakpoint
CREATE INDEX "rentals_warning_due" ON "rentals" USING btree ("warn_at") WHERE "rentals"."state" = 'reserved';--> statement-breakpoint
CREATE INDEX "rentals_user_history" ON "rentals" USING btree ("user_id","reserved_at");--> statement-breakpoint
CREATE INDEX "rentals_vehicle_history" ON "rentals" USING btree ("vehicle_id");
--> statement-breakpoint
UPDATE "app_metadata" SET "schema_version" = 2 WHERE "id" = 1;
