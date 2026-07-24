import { prisma } from "@/lib/prisma"
import DevicesClient from "./DevicesClient"

export const dynamic = "force-dynamic"

export default async function DevicesPage() {
  const [devices, rooms, units] = await Promise.all([
    prisma.device.findMany({
      include: {
        room: { select: { id: true, nama: true, workUnit: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.room.findMany({
      include: { workUnit: { select: { id: true, name: true } } },
      orderBy: { nama: "asc" },
    }),
    prisma.workUnit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Perangkat Absensi</h2>
        <p className="text-sm text-gray-500 mt-1">Provisioning dan pengelolaan perangkat ESP32 untuk absensi QR/BLE.</p>
      </div>
      <DevicesClient
        initial={devices.map((d) => ({
          id: d.id,
          deviceId: d.deviceId,
          nama: d.nama ?? null,
          status: d.status,
          roomId: d.roomId,
          room: d.room ?? null,
          ibeaconUuid: d.ibeaconUuid,
          ibeaconMajor: d.ibeaconMajor,
          ibeaconMinor: d.ibeaconMinor,
          createdAt: d.createdAt.toISOString(),
        }))}
        rooms={rooms}
        units={units}
      />
    </div>
  )
}
