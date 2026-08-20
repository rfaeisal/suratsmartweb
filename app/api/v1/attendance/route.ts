import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { verifyQrToken } from "@/lib/qr-verifier"
import {
  getAttendanceSettings,
  getFaceMatchThreshold,
  getLivenessThreshold,
  isBeaconVerificationEnabled,
  isFaceVerificationRequiredForUnit,
} from "@/lib/settings"
import { getWibDate, hitungTanggalKerja, shiftStartUtc } from "@/lib/tanggal-kerja"
import { resolveWindow } from "@/lib/attendance-window"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"
import { writeAuditLog } from "@/lib/audit"
import { cosineSimilarity, FACE_ENROLLMENT, unpackEmbedding } from "@/lib/face-embedding"
import { sendNotification } from "@/lib/notifications"

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
  face: z
    .object({
      embedding: z
        .array(z.number().finite())
        .min(FACE_ENROLLMENT.EMBEDDING_MIN_DIM)
        .max(FACE_ENROLLMENT.EMBEDDING_MAX_DIM),
      embedding_model_version: z.string().min(1).max(64),
      liveness_score: z.number().min(0).max(1),
      liveness_challenge: z.string().max(64).optional(),
      // ISO 8601 timestamp saat face+liveness selesai di-capture.
      // Backend enforce freshness < FACE_MAX_AGE_SECONDS (5 menit) supaya
      // face embedding tidak bisa di-cache lama untuk skenario titip.
      // Optional untuk backward compat build mobile yang belum kirim field ini.
      face_captured_at: z.string().datetime().optional(),
    })
    .optional(),
})

// Batas umur face capture — 5 menit dari capture sampai POST tiba.
// Match dengan client-side check (mobile v1.4.2+9).
const FACE_MAX_AGE_SECONDS = 5 * 60
// Toleransi jam HP di masa depan (kalau HP clock ngaco/skew).
const FACE_FUTURE_TOLERANCE_SECONDS = 60

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

  const { qr_token, event_type, beacon, face } = parsed.data
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

  // Face verification — hanya kalau unit pegawai (bukan device) mengaktifkannya.
  // Pakai employee.unitId (bukan device.workUnitId) supaya:
  // - Pegawai unit sensitive tetap dicek walau absen di device unit lain
  //   (mis. staff ITIKOM absen di device ruang Paviliun tetap wajib face).
  // - Tujuan face check = cegah titip absen per pegawai, bukan physical
  //   security lokasi device.
  // Skip di dev mode agar dev tools tidak break.
  let faceMatchScore: number | null = null
  let livenessScore: number | null = null
  let livenessChallenge: string | null = null
  // Sekalian ambil employee + unit info yang dipakai untuk face check, override
  // roster, dan notifikasi lembur — hindari query ganda.
  const employeeInfo = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      fullName: true,
      unitId: true,
      unit: { select: { id: true, allowAttendanceWithoutRoster: true } },
    },
  })
  const employeeUnitId = employeeInfo?.unitId
  const faceRequired =
    !devMode &&
    (await isFaceVerificationRequiredForUnit(employeeUnitId))
  if (faceRequired) {
    if (!face) return Errors.faceNotEnrolled()

    // Freshness check — cegah face embedding di-cache untuk skenario titip
    // (capture pagi hari, POST sore hari). Kalau field tidak dikirim
    // (backward compat build lama), skip — client-side check jadi satu-
    // satunya proteksi. Build mobile v1.4.2+9+ kirim field ini.
    if (face.face_captured_at) {
      const capturedAtMs = Date.parse(face.face_captured_at)
      if (Number.isNaN(capturedAtMs)) {
        return Errors.validation("face_captured_at tidak valid")
      }
      const ageSeconds = (Date.now() - capturedAtMs) / 1000
      if (ageSeconds < -FACE_FUTURE_TOLERANCE_SECONDS) {
        return Errors.validation("face_captured_at di masa depan")
      }
      if (ageSeconds > FACE_MAX_AGE_SECONDS) {
        return Errors.faceStale(Math.round(ageSeconds))
      }
    }

    const employeeFace = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { faceEmbedding: true, faceEmbeddingModelVersion: true },
    })
    if (!employeeFace?.faceEmbedding || !employeeFace.faceEmbeddingModelVersion) {
      return Errors.faceNotEnrolled()
    }
    if (employeeFace.faceEmbeddingModelVersion !== face.embedding_model_version) {
      // Model beda → embedding tidak comparable. Paksa re-enroll.
      return Errors.faceMismatch()
    }

    const [matchThreshold, livenessThreshold] = await Promise.all([
      getFaceMatchThreshold(),
      getLivenessThreshold(),
    ])

    livenessScore = face.liveness_score
    livenessChallenge = face.liveness_challenge ?? null
    if (livenessScore < livenessThreshold) {
      return Errors.faceLivenessFailed(livenessScore)
    }

    const storedEmb = unpackEmbedding(employeeFace.faceEmbedding)
    const incomingEmb = Float32Array.from(face.embedding)
    if (storedEmb.length !== incomingEmb.length) {
      return Errors.faceMismatch()
    }
    faceMatchScore = cosineSimilarity(storedEmb, incomingEmb)
    if (faceMatchScore < matchThreshold) {
      return Errors.faceMismatch(faceMatchScore)
    }
  }

  // Tentukan tanggal_kerja + lookup roster
  const now = new Date()
  const calendarDateWib = getWibDate(now)

  const shiftSelect = {
    startTime: true,
    endTime: true,
    crossesMidnight: true,
    checkInWindowStart: true,
    checkInWindowEnd: true,
    checkOutWindowStart: true,
    checkOutWindowEnd: true,
  } as const

  let roster = await prisma.roster.findUnique({
    where: { employeeId_tanggalKerja: { employeeId, tanggalKerja: calendarDateWib } },
    include: { shift: { select: shiftSelect } },
  })

  // Cek apakah pegawai sedang dalam shift lintas tengah malam dari kemarin
  if (!roster) {
    const yesterday = new Date(calendarDateWib.getTime() - 86_400_000)
    const yRoster = await prisma.roster.findUnique({
      where: { employeeId_tanggalKerja: { employeeId, tanggalKerja: yesterday } },
      include: { shift: { select: shiftSelect } },
    })
    if (yRoster?.shift.crossesMidnight) {
      const tanggalKerjaHitung = hitungTanggalKerja(now, yRoster.shift)
      if (tanggalKerjaHitung.getTime() === yesterday.getTime()) {
        roster = yRoster
      }
    }
  }

  const tanggalKerja = roster?.tanggalKerja ?? calendarDateWib

  const settings = await getAttendanceSettings()
  let telat = false
  const flags: string[] = []

  const isRegular = event_type === "masuk" || event_type === "pulang"
  const isOvertime = event_type === "lembur_masuk" || event_type === "lembur_pulang"

  // === MASUK / PULANG BIASA ===
  // Roster wajib (kecuali unit punya override atau setting global mengizinkan).
  if (isRegular && !roster) {
    const allowOverride =
      employeeInfo?.unit?.allowAttendanceWithoutRoster === true || settings.allowNoRoster
    if (!allowOverride) return Errors.noRoster()
    flags.push("no_roster")
  }

  if (isRegular && roster) {
    const window = resolveWindow(roster.shift, tanggalKerja, settings)
    if (event_type === "masuk") {
      if (now < window.checkIn.startUtc || now > window.checkIn.endUtc) {
        return Errors.outsideCheckInWindow(window.checkIn.startUtc, window.checkIn.endUtc)
      }
      const shiftStart = shiftStartUtc(tanggalKerja, roster.shift.startTime)
      const threshold = new Date(shiftStart.getTime() + settings.toleransiTelatMenit * 60_000)
      if (now > threshold) {
        telat = true
        flags.push("telat")
      }
    } else {
      if (now < window.checkOut.startUtc || now > window.checkOut.endUtc) {
        return Errors.outsideCheckOutWindow(window.checkOut.startUtc, window.checkOut.endUtc)
      }
    }
  }

  // === LEMBUR ===
  // Tidak wajib roster & tidak divalidasi window.
  // - Kalau belum ada pengajuan Overtime di tanggal itu → AUTO-CREATE
  //   pengajuan status DIAJUKAN + flag `overtime_auto_created` + notif
  //   ke Kepala Unit supaya tinggal approve dari halaman overtime.
  // - Kalau ada tapi belum SAH → cukup flag `overtime_pending` (tidak
  //   perlu notif ulang, proses approval sedang berjalan).
  // - Kalau SAH → clean tanpa flag.
  let overtimeAutoCreated = false
  if (isOvertime) {
    const overtime = await prisma.overtime.findFirst({
      where: { employeeId, tanggalKerja },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
    })

    if (!overtime) {
      const overtimeUnitId = employeeInfo?.unit?.id
      if (overtimeUnitId) {
        try {
          await prisma.overtime.create({
            data: {
              employeeId,
              workUnitId: overtimeUnitId,
              tanggalKerja,
              status: "DIAJUKAN",
              note: "Auto-generated dari tap absen lembur",
            },
          })
          overtimeAutoCreated = true
          flags.push("overtime_auto_created")
        } catch (err) {
          console.error("[attendance] Gagal auto-create overtime:", err)
          flags.push("overtime_unapproved")
        }
      } else {
        flags.push("overtime_unapproved")
      }
    } else if (overtime.status !== "SAH") {
      flags.push("overtime_pending")
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
        faceMatchScore,
        livenessScore,
        livenessChallenge,
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

  // Notif Kepala Unit kalau tap lembur baru auto-create pengajuan Overtime
  // (kalau sudah ada pending, skip supaya tidak spam ulang).
  // Non-blocking — kegagalan notif tidak boleh menggagalkan absen.
  if (overtimeAutoCreated) {
    const notifUnitId = attendance.workUnitId ?? employeeInfo?.unit?.id
    if (notifUnitId) {
      try {
        const kepalaUsers = await prisma.appUser.findMany({
          where: { managedWorkUnitId: notifUnitId, roles: { has: "KEPALA_UNIT" } },
          select: { id: true },
        })
        await Promise.all(
          kepalaUsers.map((u) =>
            sendNotification({
              event: "OVERTIME_TAP_WITHOUT_APPROVAL",
              targetUserId: u.id,
              data: {
                attendanceId: attendance.id,
                employeeId,
                employeeName: employeeInfo?.fullName ?? "",
                eventType: event_type,
                tanggalKerja: attendance.tanggalKerja.toISOString().slice(0, 10),
              },
            }),
          ),
        )
      } catch (err) {
        console.error("[attendance] Gagal kirim notif lembur unapproved:", err)
      }
      await writeAuditLog({
        actorId: authUser.userId,
        action: "OVERTIME_TAP_WITHOUT_APPROVAL",
        entityType: "Attendance",
        entityId: attendance.id,
        metadata: { eventType: event_type, employeeId, workUnitId: notifUnitId },
      })
    }
  }

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
