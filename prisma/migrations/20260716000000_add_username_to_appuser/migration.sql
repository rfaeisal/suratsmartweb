ALTER TABLE "AppUser" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
