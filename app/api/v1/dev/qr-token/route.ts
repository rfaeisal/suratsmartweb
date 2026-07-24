import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/device-crypto"
import { getAttendanceSettings } from "@/lib/settings"
import { Errors } from "@/lib/errors"

// Endpoint ini HANYA aktif saat LEGACY_SSO_MOCK=true (development)
export async function GET(req: NextRequest) {
  if (process.env.LEGACY_SSO_MOCK !== "true") {
    return Errors.notFound("Endpoint")
  }

  const deviceId = new URL(req.url).searchParams.get("device_id")
  if (!deviceId) return Errors.validation("device_id wajib diisi")

  const device = await prisma.device.findUnique({
    where: { deviceId, status: "ACTIVE" },
    select: { secretHash: true, deviceId: true },
  })
  if (!device) return Errors.notFound("Perangkat")

  const { intervalRotasiDetik } = await getAttendanceSettings()
  const counter = BigInt(Math.floor(Date.now() / 1000 / intervalRotasiDetik))

  let rawSecret: string
  try {
    rawSecret = decryptSecret(device.secretHash)
  } catch {
    return Errors.internal("Gagal mendekripsi device secret")
  }

  const hmac = createHmac("sha256", rawSecret)
    .update(device.deviceId + counter.toString())
    .digest("hex")
    .slice(0, 8)

  const token = `${device.deviceId}|${counter}|${hmac}`

  return NextResponse.json({ token, counter: counter.toString(), expires_in_sec: intervalRotasiDetik })
}
