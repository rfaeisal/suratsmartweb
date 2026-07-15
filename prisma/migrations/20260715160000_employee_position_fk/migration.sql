ALTER TABLE "Employee" ADD COLUMN "positionId" TEXT;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
