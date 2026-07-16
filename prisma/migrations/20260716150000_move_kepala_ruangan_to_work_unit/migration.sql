-- Drop kepalaRuanganId from Employee (move to WorkUnit)
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_kepalaRuanganId_fkey";
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "kepalaRuanganId";

-- Add kepalaRuanganId to WorkUnit
ALTER TABLE "WorkUnit" ADD COLUMN "kepalaRuanganId" TEXT;
ALTER TABLE "WorkUnit" ADD CONSTRAINT "WorkUnit_kepalaRuanganId_fkey"
  FOREIGN KEY ("kepalaRuanganId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
