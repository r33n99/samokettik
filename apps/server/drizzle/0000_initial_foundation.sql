-- Initial foundation only: no booking, ride or billing operations.
CREATE TABLE "app_metadata" (
	"id" integer PRIMARY KEY NOT NULL,
	"schema_version" integer NOT NULL,
	CONSTRAINT "app_metadata_singleton" CHECK ("app_metadata"."id" = 1),
	CONSTRAINT "app_metadata_version_positive" CHECK ("app_metadata"."schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" varchar(254) NOT NULL,
	"password_hash" text,
	"locale" varchar(2) DEFAULT 'ru' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_normalized_unique" UNIQUE("email_normalized"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email_normalized" = lower(trim("users"."email_normalized")) AND length("users"."email_normalized") > 3),
	CONSTRAINT "users_locale_supported" CHECK ("users"."locale" IN ('ru', 'ky'))
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_code" varchar(16) NOT NULL,
	"service_mode" varchar(16) DEFAULT 'operational' NOT NULL,
	"battery_bp" integer NOT NULL,
	"latitude_e7" integer NOT NULL,
	"longitude_e7" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_public_code_unique" UNIQUE("public_code"),
	CONSTRAINT "vehicles_battery_range" CHECK ("vehicles"."battery_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "vehicles_latitude_range" CHECK ("vehicles"."latitude_e7" BETWEEN -900000000 AND 900000000),
	CONSTRAINT "vehicles_longitude_range" CHECK ("vehicles"."longitude_e7" BETWEEN -1800000000 AND 1800000000),
	CONSTRAINT "vehicles_service_mode" CHECK ("vehicles"."service_mode" IN ('operational', 'maintenance')),
	CONSTRAINT "vehicles_version_positive" CHECK ("vehicles"."version" > 0)
);
--> statement-breakpoint
INSERT INTO "app_metadata" ("id", "schema_version") VALUES (1, 1);
