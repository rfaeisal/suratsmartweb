-- AlterTable
ALTER TABLE "Device"
  ADD COLUMN "enrollCode" TEXT,
  ADD COLUMN "enrollCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "enrolledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Device_enrollCode_key" ON "Device"("enrollCode");
