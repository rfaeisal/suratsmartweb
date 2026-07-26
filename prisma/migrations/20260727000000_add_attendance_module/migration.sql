-- ============================================================
-- Tambah enum values baru ke AppRole
-- ============================================================
ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS 'KEPALA_UNIT';
ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS 'ADMIN_UNIT';

-- ============================================================
-- Tambah kolom baru ke tabel yang sudah ada
-- ============================================================

-- AppUser: managedWorkUnitId (untuk KEPALA_UNIT & ADMIN_UNIT)
ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS "managedWorkUnitId" TEXT;

-- WorkUnit: adminUnitId (referensi ke Employee sebagai admin unit)
ALTER TABLE "WorkUnit" ADD COLUMN IF NOT EXISTS "adminUnitId" TEXT;
ALTER TABLE "WorkUnit" ADD CONSTRAINT "WorkUnit_adminUnitId_fkey"
  FOREIGN KEY ("adminUnitId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK AppUser.managedWorkUnitId → WorkUnit (harus setelah WorkUnit ada)
-- (WorkUnit sudah ada dari init migration)
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_managedWorkUnitId_fkey"
  FOREIGN KEY ("managedWorkUnitId") REFERENCES "WorkUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Enum baru untuk modul absensi
-- ============================================================
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AttendanceEvent" AS ENUM ('MASUK', 'PULANG', 'LEMBUR_MASUK', 'LEMBUR_PULANG');
CREATE TYPE "AttendanceStatus" AS ENUM ('VALID', 'ALPHA');
CREATE TYPE "ShiftType" AS ENUM ('ROTASI', 'TETAP');
CREATE TYPE "RosterPeriodStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED');
CREATE TYPE "OvertimeStatus" AS ENUM ('DIAJUKAN', 'DISETUJUI_UNIT', 'SAH', 'DITOLAK');
CREATE TYPE "SwapStatus" AS ENUM ('MENUNGGU_TARGET', 'MENUNGGU_KEPALA', 'DISETUJUI', 'DITOLAK');

-- ============================================================
-- Tabel baru: Room (ruangan, child of WorkUnit)
-- ============================================================
CREATE TABLE "Room" (
    "id"         TEXT NOT NULL,
    "nama"       TEXT NOT NULL,
    "kode"       TEXT NOT NULL,
    "workUnitId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Room_kode_key" ON "Room"("kode");
ALTER TABLE "Room" ADD CONSTRAINT "Room_workUnitId_fkey"
    FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: Device (ESP32)
-- ============================================================
CREATE TABLE "Device" (
    "id"           TEXT NOT NULL,
    "nama"         TEXT,
    "deviceId"     TEXT NOT NULL,
    "secretHash"   TEXT NOT NULL,
    "ibeaconUuid"  TEXT NOT NULL,
    "ibeaconMajor" INTEGER NOT NULL,
    "ibeaconMinor" INTEGER NOT NULL,
    "roomId"       TEXT,
    "status"       "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");
ALTER TABLE "Device" ADD CONSTRAINT "Device_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: QrUsage (dedup QR token per scan)
-- ============================================================
CREATE TABLE "QrUsage" (
    "id"         TEXT NOT NULL,
    "deviceId"   TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "counter"    BIGINT NOT NULL,
    "usedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QrUsage_employeeId_deviceId_counter_key" ON "QrUsage"("employeeId", "deviceId", "counter");
ALTER TABLE "QrUsage" ADD CONSTRAINT "QrUsage_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: Shift
-- ============================================================
CREATE TABLE "Shift" (
    "id"              TEXT NOT NULL,
    "nama"            TEXT NOT NULL,
    "startTime"       TEXT NOT NULL,
    "endTime"         TEXT NOT NULL,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "type"            "ShiftType" NOT NULL DEFAULT 'ROTASI',
    "workDays"        INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "active"          BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Tabel baru: ShiftUnit (mapping Shift ↔ WorkUnit)
-- ============================================================
CREATE TABLE "ShiftUnit" (
    "id"         TEXT NOT NULL,
    "shiftId"    TEXT NOT NULL,
    "workUnitId" TEXT NOT NULL,

    CONSTRAINT "ShiftUnit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShiftUnit_shiftId_workUnitId_key" ON "ShiftUnit"("shiftId", "workUnitId");
ALTER TABLE "ShiftUnit" ADD CONSTRAINT "ShiftUnit_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftUnit" ADD CONSTRAINT "ShiftUnit_workUnitId_fkey"
    FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: PublicHoliday (kalender libur nasional)
-- ============================================================
CREATE TABLE "PublicHoliday" (
    "id"        TEXT NOT NULL,
    "date"      DATE NOT NULL,
    "nama"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublicHoliday_date_key" ON "PublicHoliday"("date");

-- ============================================================
-- Tabel baru: RosterPeriod
-- ============================================================
CREATE TABLE "RosterPeriod" (
    "id"          TEXT NOT NULL,
    "workUnitId"  TEXT NOT NULL,
    "year"        INTEGER NOT NULL,
    "month"       INTEGER NOT NULL,
    "status"      "RosterPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RosterPeriod_workUnitId_year_month_key" ON "RosterPeriod"("workUnitId", "year", "month");
ALTER TABLE "RosterPeriod" ADD CONSTRAINT "RosterPeriod_workUnitId_fkey"
    FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: Roster
-- ============================================================
CREATE TABLE "Roster" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "workUnitId"   TEXT NOT NULL,
    "periodId"     TEXT NOT NULL,
    "shiftId"      TEXT NOT NULL,
    "tanggalKerja" DATE NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roster_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Roster_employeeId_tanggalKerja_key" ON "Roster"("employeeId", "tanggalKerja");
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_workUnitId_fkey"
    FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "RosterPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: Attendance (catatan absensi)
-- ============================================================
CREATE TABLE "Attendance" (
    "id"             TEXT NOT NULL,
    "employeeId"     TEXT NOT NULL,
    "eventType"      "AttendanceEvent" NOT NULL,
    "recordedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tanggalKerja"   DATE NOT NULL,
    "deviceId"       TEXT NOT NULL,
    "roomId"         TEXT,
    "workUnitId"     TEXT,
    "counter"        BIGINT NOT NULL,
    "beaconDetected" BOOLEAN NOT NULL,
    "status"         "AttendanceStatus" NOT NULL DEFAULT 'VALID',
    "telat"          BOOLEAN NOT NULL DEFAULT false,
    "flags"          JSONB NOT NULL DEFAULT '[]',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Attendance_employeeId_deviceId_counter_key" ON "Attendance"("employeeId", "deviceId", "counter");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_workUnitId_fkey"
    FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: AlphaRecord (ketidakhadiran otomatis)
-- ============================================================
CREATE TABLE "AlphaRecord" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "rosterId"     TEXT NOT NULL,
    "tanggalKerja" DATE NOT NULL,
    "markedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlphaRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AlphaRecord_rosterId_key" ON "AlphaRecord"("rosterId");
CREATE UNIQUE INDEX "AlphaRecord_employeeId_tanggalKerja_key" ON "AlphaRecord"("employeeId", "tanggalKerja");
ALTER TABLE "AlphaRecord" ADD CONSTRAINT "AlphaRecord_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlphaRecord" ADD CONSTRAINT "AlphaRecord_rosterId_fkey"
    FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: Overtime (lembur)
-- ============================================================
CREATE TABLE "Overtime" (
    "id"              TEXT NOT NULL,
    "employeeId"      TEXT NOT NULL,
    "workUnitId"      TEXT NOT NULL,
    "tanggalKerja"    DATE NOT NULL,
    "status"          "OvertimeStatus" NOT NULL DEFAULT 'DIAJUKAN',
    "approvedUnitBy"  TEXT,
    "approvedUnitAt"  TIMESTAMP(3),
    "approvedHrBy"    TEXT,
    "approvedHrAt"    TIMESTAMP(3),
    "rejectedBy"      TEXT,
    "rejectedAt"      TIMESTAMP(3),
    "note"            TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Overtime_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_workUnitId_fkey"
    FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabel baru: ShiftSwapRequest (tukar shift)
-- ============================================================
CREATE TABLE "ShiftSwapRequest" (
    "id"                TEXT NOT NULL,
    "requesterId"       TEXT NOT NULL,
    "targetId"          TEXT NOT NULL,
    "requesterRosterId" TEXT NOT NULL,
    "targetRosterId"    TEXT NOT NULL,
    "workUnitId"        TEXT NOT NULL,
    "status"            "SwapStatus" NOT NULL DEFAULT 'MENUNGGU_TARGET',
    "alasan"            TEXT,
    "rejectedBy"        TEXT,
    "approvedByUnitAt"  TIMESTAMP(3),
    "approvedByUnitId"  TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterRosterId_fkey"
    FOREIGN KEY ("requesterRosterId") REFERENCES "Roster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_targetRosterId_fkey"
    FOREIGN KEY ("targetRosterId") REFERENCES "Roster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_workUnitId_fkey"
    FOREIGN KEY ("workUnitId") REFERENCES "WorkUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
