import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { verifyQrToken } from "@/lib/qr-verifier"
import { getAttendanceSettings } from "@/lib/settings"
import { getWibDate, hitungTanggalKerja, shiftStartUtc } from "@/lib/tanggal-kerja"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"
import { writeAuditLog } from "@/lib/audit"

const bodySchema = z.object({
  qr_token: z.string().min(1),
  event_type: z.enum(["masuk", "pulang", "lembur_masuk", "lembur_pulang"]),
  beacon: z.object({
    detected: z.boolean(),
    uuid: z.string().optional(),
    major: z.number().int().optional(),
    minor: z.number().int().optional(),
  }),
  client_time: z.string(),
})

const EVENT_TYPE_MAP = {
  masuk: "MASUK",
  pulang: "PULANG",
  lembur_masuk: "LEMBUR_MASUK",
  lembur_pulang: "LEMBUR_PULANG",
} as const

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown"
  if (!rateLimit(`attendance:${ip}`, 20, 60_000)) {
    return Errors.tooManyRequests("Terlalu banyak permintaan absen. Coba lagi dalam beberapa saat.")
  }

  let authUser
  try {
    authUser = await requireAuth(req, ["PEGAWAI"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Body JSON tidak valid")
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const { qr_token, event_type, beacon } = parsed.data
  const { employeeId } = authUser

  // Verifikasi QR token (parse → device → counter window → HMAC → dedup)
  const qrResult = await verifyQrToken(qr_token, employeeId)
  if (!qrResult.ok) {
    if (qrResult.error === "qr_expired") return Errors.qrExpired()
    if (qrResult.error === "qr_replayed") return Errors.qrReplayed()
    return Errors.qrInvalid()
  }

  // Beacon wajib terdeteksi (anti-relay)
  if (!beacon.detected) return Errors.beaconTidakTerdeteksi()

  // Tentukan tanggal_kerja + lookup roster
  const now = new Date()
  const calendarDateWib = getWibDate(now)

  let roster = await prisma.roster.findUnique({
    where: { employeeId_tanggalKerja: { employeeId, tanggalKerja: calendarDateWib } },
    include: { shift: { select: { startTime: true, crossesMidnight: true, endTime: true } } },
  })

  // Cek apakah pegawai sedang dalam shift lintas tengah malam dari kemarin
  if (!roster) {
    const yesterday = new Date(calendarDateWib.getTime() - 86_400_000)
    const yRoster = await prisma.roster.findUnique({
      where: { employeeId_tanggalKerja: { employeeId, tanggalKerja: yesterday } },
      include: { shift: { select: { startTime: true, crossesMidnight: true, endTime: true } } },
    })
    if (yRoster?.shift.crossesMidnight) {
      const tanggalKerjaHitung = hitungTanggalKerja(now, yRoster.shift)
      if (tanggalKerjaHitung.getTime() === yesterday.getTime()) {
        roster = yRoster
      }
    }
  }

  if (!roster) return Errors.noRoster()
  const tanggalKerja = roster.tanggalKerja

  // Hitung telat (hanya untuk event masuk)
  const settings = await getAttendanceSettings()
  let telat = false
  const flags: string[] = []

  if (event_type === "masuk") {
    const shiftStart = shiftStartUtc(tanggalKerja, roster.shift.startTime)
    const threshold = new Date(shiftStart.getTime() + settings.toleransiTelatMenit * 60_000)
    if (now > threshold) {
      telat = true
      flags.push("telat")
    }
  }

  const { device } = qrResult
  const attendance = await prisma.$transaction(async (tx) => {
    await tx.qrUsage.create({
      data: { deviceId: device.id, employeeId, counter: qrResult.counter },
    })
    return tx.attendance.create({
      data: {
        employeeId,
        eventType: EVENT_TYPE_MAP[event_type],
        recordedAt: now,
        tanggalKerja,
        deviceId: device.id,
        roomId: device.roomId,
        workUnitId: device.workUnitId,
        counter: qrResult.counter,
        beaconDetected: true,
        status: "VALID",
        telat,
        flags,
      },
      include: {
        room: { select: { id: true, nama: true } },
        workUnit: { select: { id: true, name: true } },
      },
    })
  })

  await writeAuditLog({
    actorId: authUser.userId,
    action: "ATTENDANCE_RECORD",
    entityType: "Attendance",
    entityId: attendance.id,
    metadata: { eventType: event_type, employeeId },
  })

  return NextResponse.json(
    {
      attendance_id: attendance.id,
      event_type: attendance.eventType,
      recorded_at: attendance.recordedAt,
      tanggal_kerja: attendance.tanggalKerja,
      status: attendance.status,
      telat: attendance.telat,
      flags: attendance.flags,
      room: attendance.room ?? null,
      unit: attendance.workUnit ?? null,
    },
    { status: 201 },
  )
}
