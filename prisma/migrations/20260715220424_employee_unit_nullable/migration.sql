-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_unitId_fkey";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "unitId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "WorkUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
