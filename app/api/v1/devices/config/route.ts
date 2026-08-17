import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/device-crypto"
import { getAttendanceSettings, isBeaconVerificationEnabled } from "@/lib/settings"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"

const bodySchema = z.object({
  device_id: z.string().min(1),
  ts: z.number().int().positive(),
  sig: z.string().length(16),
})

const CLOCK_SKEW_SEC = 120

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  if (!rateLimit(`device-config:${ip}`, 60, 60_000)) return Errors.tooManyRequests()

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Payload tidak valid")

  const { device_id, ts, sig } = parsed.data

  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > CLOCK_SKEW_SEC) {
    return Errors.validation("Timestamp di luar toleransi")
  }

  const device = await prisma.device.findUnique({
    where: { deviceId: device_id, status: "ACTIVE" },
    select: { deviceId: true, nama: true, secretHash: true },
  })
  if (!device) return Errors.notFound("Perangkat")

  let secret: string
  try {
    secret = decryptSecret(device.secretHash)
  } catch {
    return Errors.internal()
  }

  const expected = createHmac("sha256", secret)
    .update(device_id + String(ts))
    .digest("hex")
    .slice(0, 16)

  const match =
    sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!match) return Errors.validation("Signature tidak cocok")

  const { intervalRotasiDetik } = await getAttendanceSettings()
  const beaconEnabled = await isBeaconVerificationEnabled()

  return NextResponse.json({
    label: device.nama ?? device.deviceId,
    interval_rotasi_detik: intervalRotasiDetik,
    beacon_broadcast_enabled: beaconEnabled,
  })
}
