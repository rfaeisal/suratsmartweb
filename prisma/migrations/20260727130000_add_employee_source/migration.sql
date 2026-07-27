-- CreateEnum
CREATE TYPE "EmployeeSource" AS ENUM ('MOCK', 'LEGACY', 'MANUAL');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "source" "EmployeeSource" NOT NULL DEFAULT 'LEGACY';

-- Backfill: tandai pegawai mock berdasarkan legacyId dari lib/legacy/client.ts MOCK_ACCOUNTS
UPDATE "Employee" SET "source" = 'MOCK' WHERE "legacyId" IN (
  '9996', '9997', '9998', '9999',
  '5001', '5002',
  '4001',
  '3001',
  '2001',
  '1001', '1002',
  '6001', '6002'
);
