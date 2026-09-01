-- Restrict StudentLevel to L100..L400 (levels above 400 are no longer valid).
-- Postgres cannot DROP a value from an existing enum type, so this creates a
-- new enum, guards against existing L500/L600 rows, migrates the column
-- across, then drops the old type.

-- Safety check: refuse to run if any student currently sits above L400.
-- If this fires, decide how to reassign those students (e.g. bump them to
-- L400, or archive/deactivate them) before re-running.
DO $$
DECLARE
  offending_count integer;
BEGIN
  SELECT COUNT(*) INTO offending_count FROM "students" WHERE "level" IN ('L500', 'L600');
  IF offending_count > 0 THEN
    RAISE EXCEPTION 'Cannot restrict StudentLevel to L100-L400: % student(s) are currently L500/L600. Reassign or remove them first.', offending_count;
  END IF;
END $$;

-- CreateEnum (new, restricted)
CREATE TYPE "StudentLevel_new" AS ENUM ('L100', 'L200', 'L300', 'L400');

-- Migrate the column to the new enum
ALTER TABLE "students" ALTER COLUMN "level" TYPE "StudentLevel_new" USING ("level"::text::"StudentLevel_new");

-- Swap the type names
ALTER TYPE "StudentLevel" RENAME TO "StudentLevel_old";
ALTER TYPE "StudentLevel_new" RENAME TO "StudentLevel";
DROP TYPE "StudentLevel_old";
