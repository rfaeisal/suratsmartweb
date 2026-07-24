import { createHmac, timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import { getAttendanceSettings } from "@/lib/settings"
import { decryptSecret } from "@/lib/device-crypto"

export type QrVerifyError = "qr_invalid" | "qr_expired" | "qr_replayed" | "device_not_found"

export interface QrVerifyResult {
  ok: true
  deviceId: string
  device: { id: string; roomId: string | null; workUnitId: string | null }
  counter: bigint
}

export interface QrVerifyFailure {
  ok: false
  error: QrVerifyError
}

export async function verifyQrToken(
  rawToken: string,
  employeeId: string,
): Promise<QrVerifyResult | QrVerifyFailure> {
  const parts = rawToken.split("|")
  if (parts.length !== 3) return { ok: false, error: "qr_invalid" }

  const [deviceId, counterStr, hmac] = parts
  const counter = BigInt(counterStr)

  const device = await prisma.device.findUnique({
    where: { deviceId, status: "ACTIVE" },
    select: { id: true, secretHash: true, roomId: true, room: { select: { workUnitId: true } } },
  })
  if (!device) return { ok: false, error: "device_not_found" }

  const { intervalRotasiDetik } = await getAttendanceSettings()
  const nowCounter = BigInt(Math.floor(Date.now() / 1000 / intervalRotasiDetik))
  if (counter !== nowCounter && counter !== nowCounter - 1n) {
    return { ok: false, error: "qr_expired" }
  }

  let rawSecret: string
  try {
    rawSecret = decryptSecret(device.secretHash)
  } catch {
    return { ok: false, error: "qr_invalid" }
  }

  const expected = createHmac("sha256", rawSecret)
    .update(deviceId + counterStr)
    .digest("hex")
    .slice(0, 8)

  const match = timingSafeEqual(
    Buffer.from(hmac.padEnd(8, "0").slice(0, 8)),
    Buffer.from(expected),
  )
  if (!match) return { ok: false, error: "qr_invalid" }

  const existing = await prisma.qrUsage.findUnique({
    where: { employeeId_deviceId_counter: { employeeId, deviceId: device.id, counter } },
  })
  if (existing) return { ok: false, error: "qr_replayed" }

  return {
    ok: true,
    deviceId,
    device: { id: device.id, roomId: device.roomId, workUnitId: device.room?.workUnitId ?? null },
    counter,
  }
}
