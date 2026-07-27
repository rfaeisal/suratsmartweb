-- CreateEnum
CREATE TYPE "PublicHolidayType" AS ENUM ('NASIONAL', 'CUTI_BERSAMA');

-- AlterTable
ALTER TABLE "PublicHoliday" ADD COLUMN "jenis" "PublicHolidayType" NOT NULL DEFAULT 'NASIONAL';
