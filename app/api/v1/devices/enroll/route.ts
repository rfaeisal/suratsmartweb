import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/device-crypto"
import { getAttendanceSettings, isBeaconVerificationEnabled } from "@/lib/settings"
import { writeAuditLog } from "@/lib/audit"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"

const enrollSchema = z.object({
  enroll_code: z.string().min(4).max(32),
})

export async function POST(req: NextRequest) {
  // Rate limit: 20 percobaan/menit per IP untuk endpoint publik
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  if (!rateLimit(`enroll:${ip}`, 20, 60_000)) return Errors.tooManyRequests()

  const body = await req.json().catch(() => ({}))
  const parsed = enrollSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("enroll_code diperlukan")

  const code = parsed.data.enroll_code.trim().toUpperCase()

  const device = await prisma.device.findUnique({ where: { enrollCode: code } })
  if (!device) return Errors.notFound("Kode enroll")
  if (!device.enrollCodeExpiresAt || device.enrollCodeExpiresAt < new Date()) {
    // Bersihkan token kedaluwarsa
    await prisma.device.update({
      where: { id: device.id },
      data: { enrollCode: null, enrollCodeExpiresAt: null },
    })
    return Errors.validation("Kode enroll sudah kedaluwarsa")
  }
  if (device.status !== "ACTIVE") return Errors.validation("Perangkat tidak aktif")

  let secret: string
  try {
    secret = decryptSecret(device.secretHash)
  } catch {
    return Errors.internal()
  }

  const { intervalRotasiDetik } = await getAttendanceSettings()
  const beaconEnabled = await isBeaconVerificationEnabled()

  // Kunci enrollment: invalidate token, catat waktu enrollment.
  await prisma.device.update({
    where: { id: device.id },
    data: { enrollCode: null, enrollCodeExpiresAt: null, enrolledAt: new Date() },
  })

  await writeAuditLog({
    action: "DEVICE_ENROLLED",
    entityType: "Device",
    entityId: device.id,
    metadata: { device_id: device.deviceId, ip },
  })

  const baseUrl =
    process.env["NEXTAUTH_URL"] ??
    process.env["APP_URL"] ??
    `${req.nextUrl.protocol}//${req.nextUrl.host}`

  return NextResponse.json({
    device_id: device.deviceId,
    secret,
    label: device.nama ?? device.deviceId,
    ibeacon: {
      uuid: device.ibeaconUuid,
      major: device.ibeaconMajor,
      minor: device.ibeaconMinor,
    },
    interval_rotasi_detik: intervalRotasiDetik,
    beacon_broadcast_enabled: beaconEnabled,
    server_url: baseUrl,
  })
}
