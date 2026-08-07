import { prisma } from "@/lib/prisma"
import { encryptSecret, generateDeviceSecret } from "@/lib/device-crypto"

export const MOCK_DEVICE_ID = "DEV-MOCK-001"
const MOCK_ROOM_KODE = "MOCK-R01"

// Idempotent: pastikan Device dengan deviceId=DEV-MOCK-001 ada & ACTIVE.
// Kalau belum ada, dibuat on-demand. Room dilampirkan jika ada WorkUnit
// yang tersedia; kalau DB masih kosong, device tetap dibuat tanpa room.
export async function ensureMockDevice() {
  const existing = await prisma.device.findUnique({ where: { deviceId: MOCK_DEVICE_ID } })
  if (existing) {
    if (existing.status !== "ACTIVE") {
      await prisma.device.update({ where: { id: existing.id }, data: { status: "ACTIVE" } })
    }
    return
  }

  let roomId: string | null = null
  const anyWorkUnit = await prisma.workUnit.findFirst({ select: { id: true }, orderBy: { id: "asc" } })
  if (anyWorkUnit) {
    const room = await prisma.room.upsert({
      where: { kode: MOCK_ROOM_KODE },
      create: { nama: "Ruang Mock Dev", kode: MOCK_ROOM_KODE, workUnitId: anyWorkUnit.id },
      update: {},
      select: { id: true },
    })
    roomId = room.id
  }

  await prisma.device.create({
    data: {
      deviceId: MOCK_DEVICE_ID,
      nama: "Perangkat Mock (Dev Only)",
      secretHash: encryptSecret(generateDeviceSecret()),
      ibeaconUuid: "00000000-0000-0000-0000-000000000000",
      ibeaconMajor: 0,
      ibeaconMinor: 1,
      roomId,
      status: "ACTIVE",
    },
  })
}
