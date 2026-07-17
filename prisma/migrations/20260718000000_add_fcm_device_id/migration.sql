-- AlterTable: FcmToken
-- Remove unique constraint from token, add deviceId as unique identifier per device
ALTER TABLE "FcmToken" DROP CONSTRAINT IF EXISTS "FcmToken_token_key";
ALTER TABLE "FcmToken" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "FcmToken" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "FcmToken_deviceId_key" ON "FcmToken"("deviceId");
