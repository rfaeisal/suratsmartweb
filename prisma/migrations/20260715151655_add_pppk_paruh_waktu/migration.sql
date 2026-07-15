-- AlterEnum
ALTER TYPE "EmployeeType" ADD VALUE 'PPPK_PARUH_WAKTU';

-- AlterTable
ALTER TABLE "AppUser" ALTER COLUMN "roles" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Position" ALTER COLUMN "updatedAt" DROP DEFAULT;
