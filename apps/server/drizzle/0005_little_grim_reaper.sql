CREATE INDEX "invoices_owner_cursor" ON "invoices" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "rentals_finished_cursor" ON "rentals" USING btree ("user_id","ended_at","id") WHERE "rentals"."state" = 'finished';
--> statement-breakpoint
UPDATE "app_metadata" SET "schema_version" = 6 WHERE "id" = 1;
