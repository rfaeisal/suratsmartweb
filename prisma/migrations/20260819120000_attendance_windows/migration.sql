-- Attendance windows per Shift + roster override flag per WorkUnit
-- Semua field additive & default-safe, aman diapply pada DB yang sudah punya data.

ALTER TABLE "Shift"
  ADD COLUMN "checkInWindowStart"  TEXT,
  ADD COLUMN "checkInWindowEnd"    TEXT,
  ADD COLUMN "checkOutWindowStart" TEXT,
  ADD COLUMN "checkOutWindowEnd"   TEXT;

ALTER TABLE "WorkUnit"
  ADD COLUMN "allowAttendanceWithoutRoster" BOOLEAN NOT NULL DEFAULT false;
