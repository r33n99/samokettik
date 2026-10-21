ALTER TABLE "realtime_tickets" ADD COLUMN "auth_expires_at" timestamp with time zone;
--> statement-breakpoint
-- Pre-upgrade one-use tickets have no authentication deadline. Invalidate only
-- these short-lived credentials; rentals, invoices and user data are retained.
DELETE FROM "realtime_tickets";
--> statement-breakpoint
UPDATE "app_metadata" SET "schema_version" = 5 WHERE "id" = 1;
