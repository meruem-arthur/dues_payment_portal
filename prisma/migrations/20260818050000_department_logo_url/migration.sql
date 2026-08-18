-- Add an optional logo (stored as a data URL) to departments. Shown as a
-- small circular badge under the department name on the public student
-- payment page. Nullable and defaults to NULL - departments created before
-- this migration, or created without uploading a logo, simply render
-- nothing there.

ALTER TABLE "departments"
  ADD COLUMN "logoUrl" TEXT;
