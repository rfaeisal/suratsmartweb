import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { getWibDate } from "@/lib/tanggal-kerja"

const bodySchema = z.object({
  employeeId: z.string().min(1),
  eventType: z.enum(["MASUK", "PULANG", "LEMBUR_MASUK", "LEMBUR_PULANG"]),
  recordedAt: z.string().datetime(), // ISO8601
  deviceId: z.string().optional(), // deviceId internal (cuid) — opsional bila tidak tahu mesin
  roomId: z.string().optional(),
  reason: z.string().min(3).max(500),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (
    !session.user.roles.includes("ADMIN_KEPEGAWAIAN") &&
    !session.user.roles.includes("SUPERADMIN")
  ) {
    return Errors.forbidden()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation(parsed.error.issues[0]?.message ?? "Payload tidak valid")
  }

  const { employeeId, eventType, recordedAt, deviceId, roomId, reason } = parsed.data
  const recordedAtDate = new Date(recordedAt)
  if (Number.isNaN(recordedAtDate.getTime())) {
    return Errors.validation("recordedAt tidak valid")
  }
  if (recordedAtDate > new Date(Date.now() + 60_000)) {
    return Errors.validation("recordedAt tidak boleh di masa depan")
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, unitId: true },
  })
  if (!employee) return Errors.notFound("Pegawai")

  // Kalau deviceId tidak diisi, cari device dummy per unit atau tolak.
  // Untuk simplifikasi: kalau deviceId kosong, ambil device manapun yang
  // masih ACTIVE di roomId (kalau roomId diisi) atau pertama di list.
  let resolvedDeviceId = deviceId
  let resolvedRoomId = roomId ?? null
  let resolvedWorkUnitId = employee.unitId ?? null

  if (resolvedDeviceId) {
    const device = await prisma.device.findUnique({
      where: { id: resolvedDeviceId },
      select: { id: true, roomId: true, room: { select: { workUnitId: true } } },
    })
    if (!device) return Errors.validation("Device tidak ditemukan")
    resolvedRoomId = resolvedRoomId ?? device.roomId
    resolvedWorkUnitId = device.room?.workUnitId ?? resolvedWorkUnitId
  } else {
    // Ambil device manapun yang ACTIVE — hanya untuk memenuhi FK constraint.
    const anyDevice = await prisma.device.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })
    if (!anyDevice) return Errors.validation("Tidak ada device aktif untuk placeholder")
    resolvedDeviceId = anyDevice.id
  }

  const tanggalKerja = getWibDate(recordedAtDate)

  // Counter unik: pakai epoch dari recordedAt biar tidak nabrak dedup absen real.
  // Prefix dengan negative-signed BigInt tidak ada di Prisma — pakai epoch detik saja.
  // Anti-clash: kombinasi (employeeId, deviceId, counter) unique. Kalau kebetulan
  // sama dengan absen real, admin harus pilih waktu berbeda.
  const counter = BigInt(Math.floor(recordedAtDate.getTime() / 1000))

  try {
    const attendance = await prisma.attendance.create({
      data: {
        employeeId,
        eventType,
        recordedAt: recordedAtDate,
        tanggalKerja,
        deviceId: resolvedDeviceId,
        roomId: resolvedRoomId,
        workUnitId: resolvedWorkUnitId,
        counter,
        beaconDetected: false,
        status: "MANUAL_RECOVERY",
        telat: false,
        manualRecoveryBy: session.user.id,
        manualRecoveryReason: reason,
      },
      select: { id: true, recordedAt: true, tanggalKerja: true, eventType: true, status: true },
    })

    await writeAuditLog({
      actorId: session.user.id,
      action: "MANUAL_ATTENDANCE_RECOVERY",
      entityType: "Attendance",
      entityId: attendance.id,
      metadata: {
        employeeId,
        eventType,
        recordedAt,
        reason,
      },
    })

    return NextResponse.json({
      id: attendance.id,
      status: attendance.status,
      recordedAt: attendance.recordedAt.toISOString(),
      tanggalKerja: attendance.tanggalKerja.toISOString().slice(0, 10),
      eventType: attendance.eventType,
    })
  } catch (err) {
    // Kemungkinan clash unique (employeeId, deviceId, counter)
    return Errors.conflict(
      `Gagal simpan — kemungkinan sudah ada absen di detik yang sama: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    )
  }
}
