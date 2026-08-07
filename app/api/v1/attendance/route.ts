import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { verifyQrToken } from "@/lib/qr-verifier"
import { getAttendanceSettings, isBeaconVerificationEnabled } from "@/lib/settings"
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

export async function GET(req: NextRequest) {
  let auth
  try {
    auth = await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN", "KEPALA_UNIT", "ADMIN_UNIT"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { searchParams } = new URL(req.url)
  const workUnitId = searchParams.get("work_unit_id")
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")
  const employeeId = searchParams.get("employee_id")
  const status     = searchParams.get("status") // "VALID" | "INVALID"

  const isUnitRole = auth.roles.includes("KEPALA_UNIT") || auth.roles.includes("ADMIN_UNIT")
  const isAdmin    = auth.roles.includes("ADMIN_KEPEGAWAIAN") || auth.roles.includes("SUPERADMIN")

  // Unit role hanya bisa lihat unitnya sendiri
  const effectiveUnitId = isUnitRole && !isAdmin
    ? (auth.managedWorkUnitId ?? "__none__")
    : (workUnitId ?? undefined)

  const where: Record<string, unknown> = {}
  if (effectiveUnitId) where.workUnitId = effectiveUnitId
  if (employeeId)      where.employeeId = employeeId
  if (status)          where.status = status
  if (from || to) {
    where.tanggalKerja = {
      ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
      ...(to   ? { lte: new Date(to   + "T23:59:59.999Z") } : {}),
    }
  }

  const records = await prisma.attendance.findMany({
    where,
    include: {
      employee: { select: { nip: true, fullName: true } },
      room:     { select: { nama: true } },
    },
    orderBy: [{ tanggalKerja: "desc" }, { recordedAt: "desc" }],
    take: 500,
  })

  return NextResponse.json({
    data: records.map((r) => ({
      id:             r.id,
      employee_id:    r.employeeId,
      nip:            r.employee.nip,
      nama:           r.employee.fullName,
      work_unit_id:   r.workUnitId,
      shift:          null,
      room:           r.room?.nama ?? null,
      event_type:     r.eventType,
      recorded_at:    r.recordedAt.toISOString(),
      tanggal_kerja:  r.tanggalKerja.toISOString().slice(0, 10),
      status:         r.status,
      telat:          r.telat,
      beacon_detected: r.beaconDetected,
    })),
  })
}

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

  // Beacon wajib terdeteksi (anti-relay) — dilewati di dev mode atau bila
  // toggle AppSetting `beacon_verification_enabled` dimatikan (masa uji coba
  // sebelum device beacon fisik terpasang).
  const devMode = process.env.LEGACY_SSO_MOCK === "true"
  const beaconRequired = await isBeaconVerificationEnabled()
  if (!beacon.detected && beaconRequired && !devMode) return Errors.beaconTidakTerdeteksi()

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

  // Tidak ada roster tetap direkam — handle tukar shift yang belum disetujui
  const tanggalKerja = roster?.tanggalKerja ?? calendarDateWib

  const settings = await getAttendanceSettings()
  let telat = false
  const flags: string[] = []
  if (!roster) flags.push("no_roster")

  if (event_type === "masuk" && roster) {
    const shiftStart = shiftStartUtc(tanggalKerja, roster.shift.startTime)
    const threshold = new Date(shiftStart.getTime() + settings.toleransiTelatMenit * 60_000)
    if (now > threshold) {
      telat = true
      flags.push("telat")
    }
  }

  const { device } = qrResult

  // Di dev mode tanpa roster, fallback workUnitId dari data employee
  let workUnitId = device.workUnitId
  if (!workUnitId && !roster) {
    const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { unitId: true } })
    workUnitId = emp?.unitId ?? null
  }

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
        workUnitId,
        counter: qrResult.counter,
        beaconDetected: devMode ? false : beacon.detected,
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
