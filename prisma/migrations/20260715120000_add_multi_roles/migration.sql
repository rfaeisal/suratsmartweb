-- Add roles array column (nullable first so data migration can run)
ALTER TABLE "AppUser" ADD COLUMN "roles" "AppRole"[];

-- Migrate existing single role to array
UPDATE "AppUser" SET "roles" = ARRAY["role"];

-- Make roles NOT NULL now that data is migrated
ALTER TABLE "AppUser" ALTER COLUMN "roles" SET NOT NULL;
ALTER TABLE "AppUser" ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"AppRole"[];

-- Drop old single-role column
ALTER TABLE "AppUser" DROP COLUMN "role";
