import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/device-crypto"
import { getAttendanceSettings } from "@/lib/settings"
import { Errors } from "@/lib/errors"

// Endpoint ini HANYA aktif saat LEGACY_SSO_MOCK=true (development)
// Mengembalikan QR code sebagai PNG untuk ditampilkan di halaman dev tools
export async function GET(req: NextRequest) {
  if (process.env.LEGACY_SSO_MOCK !== "true") {
    return Errors.notFound("Endpoint")
  }

  const deviceId = new URL(req.url).searchParams.get("device_id") ?? "DEV-MOCK-001"

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

  const secondsUsed = Math.floor(Date.now() / 1000) % intervalRotasiDetik
  const expiresIn = intervalRotasiDetik - secondsUsed

  const pngBuffer = await QRCode.toBuffer(token, {
    errorCorrectionLevel: "M",
    width: 400,
    margin: 2,
  })

  return new NextResponse(pngBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Token": token,
      "X-Expires-In": expiresIn.toString(),
      "X-Interval": intervalRotasiDetik.toString(),
    },
  })
}
