-- Face recognition — Fase tambahan absensi.
-- Rincian PRD di docs/06-FACE-RECOGNITION-PRD.md.

-- AlterTable: Employee — kolom face recognition (semua nullable, backfill kosong)
ALTER TABLE "Employee"
  ADD COLUMN "faceEmbedding"             BYTEA,
  ADD COLUMN "faceThumbnailUrl"          TEXT,
  ADD COLUMN "faceEnrolledAt"            TIMESTAMP(3),
  ADD COLUMN "faceEmbeddingModelVersion" TEXT,
  ADD COLUMN "faceEnrollmentDeviceInfo"  JSONB;

-- AlterTable: Attendance — kolom face + manual recovery
ALTER TABLE "Attendance"
  ADD COLUMN "faceMatchScore"       DOUBLE PRECISION,
  ADD COLUMN "livenessScore"        DOUBLE PRECISION,
  ADD COLUMN "livenessChallenge"    TEXT,
  ADD COLUMN "manualRecoveryBy"     TEXT,
  ADD COLUMN "manualRecoveryReason" TEXT;

-- AlterEnum: AttendanceStatus — tambah MANUAL_RECOVERY
ALTER TYPE "AttendanceStatus" ADD VALUE 'MANUAL_RECOVERY';

-- CreateEnum: FaceEnrollmentStatus
CREATE TYPE "FaceEnrollmentStatus" AS ENUM (
  'PENDING',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'EXPIRED'
);

-- CreateTable: FaceEnrollmentSession
CREATE TABLE "FaceEnrollmentSession" (
  "id"                    TEXT NOT NULL,
  "employeeId"            TEXT NOT NULL,
  "adminId"               TEXT NOT NULL,
  "token"                 TEXT NOT NULL,
  "tokenExpiresAt"        TIMESTAMP(3) NOT NULL,
  "status"                "FaceEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt"           TIMESTAMP(3),
  "embedding"             BYTEA,
  "embeddingModelVersion" TEXT,
  "thumbnailUrl"          TEXT,
  "deviceInfo"            JSONB,
  "approvedAt"            TIMESTAMP(3),
  "approvedBy"            TEXT,
  "rejectedAt"            TIMESTAMP(3),
  "rejectedBy"            TEXT,
  "rejectReason"          TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FaceEnrollmentSession_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE UNIQUE INDEX "FaceEnrollmentSession_token_key"
  ON "FaceEnrollmentSession"("token");
CREATE INDEX "FaceEnrollmentSession_employeeId_status_idx"
  ON "FaceEnrollmentSession"("employeeId", "status");
CREATE INDEX "FaceEnrollmentSession_status_tokenExpiresAt_idx"
  ON "FaceEnrollmentSession"("status", "tokenExpiresAt");

-- FK
ALTER TABLE "FaceEnrollmentSession"
  ADD CONSTRAINT "FaceEnrollmentSession_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
