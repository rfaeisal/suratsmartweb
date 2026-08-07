import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/device-crypto"
import { getAttendanceSettings } from "@/lib/settings"
import { Errors } from "@/lib/errors"
import { requireSuperAdmin } from "@/lib/dev/require-superadmin"
import { ensureMockDevice, MOCK_DEVICE_ID } from "@/lib/dev/ensure-mock-device"

// Endpoint dev tools — hanya SUPERADMIN. Dipakai untuk uji coba QR sebelum
// device asli tersedia. Mengembalikan QR code sebagai PNG.
export async function GET(req: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const deviceId = new URL(req.url).searchParams.get("device_id") ?? MOCK_DEVICE_ID

  if (deviceId === MOCK_DEVICE_ID) await ensureMockDevice()

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

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Token": token,
      "X-Expires-In": expiresIn.toString(),
      "X-Interval": intervalRotasiDetik.toString(),
    },
  })
}
