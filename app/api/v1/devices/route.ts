import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { writeAuditLog } from "@/lib/audit"
import { Errors } from "@/lib/errors"
import { encryptSecret, generateDeviceId, generateDeviceSecret } from "@/lib/device-crypto"

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const devices = await prisma.device.findMany({
    include: {
      room: {
        select: { id: true, nama: true, workUnit: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    data: devices.map((d) => ({
      id: d.id,
      nama: d.nama,
      device_id: d.deviceId,
      ibeacon: { uuid: d.ibeaconUuid, major: d.ibeaconMajor, minor: d.ibeaconMinor },
      room: d.room
        ? { id: d.room.id, nama: d.room.nama, unit: { id: d.room.workUnit.id, name: d.room.workUnit.name } }
        : null,
      status: d.status,
      created_at: d.createdAt,
    })),
  })
}

const createSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  ibeacon_uuid: z.string().uuid().optional(),
  ibeacon_major: z.number().int().min(0).max(65535).optional(),
  ibeacon_minor: z.number().int().min(0).max(65535).optional(),
  room_id: z.string().min(1).optional(),
})

export async function POST(req: NextRequest) {
  let authUser
  try {
    authUser = await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const { nama, room_id } = parsed.data
  const ibeaconUuid = parsed.data.ibeacon_uuid ?? randomUUID()
  const ibeaconMajor = parsed.data.ibeacon_major ?? Math.floor(Math.random() * 65536)
  const ibeaconMinor = parsed.data.ibeacon_minor ?? Math.floor(Math.random() * 65536)

  if (room_id) {
    const room = await prisma.room.findUnique({ where: { id: room_id } })
    if (!room) return Errors.notFound("Ruangan")
  }

  const deviceId = generateDeviceId()
  const rawSecret = generateDeviceSecret()
  const secretHash = encryptSecret(rawSecret)

  const device = await prisma.device.create({
    data: { nama: nama ?? null, deviceId, secretHash, ibeaconUuid, ibeaconMajor, ibeaconMinor, roomId: room_id ?? null },
    include: {
      room: { select: { id: true, nama: true, workUnit: { select: { id: true, name: true } } } },
    },
  })

  await writeAuditLog({
    actorId: authUser.userId,
    action: "DEVICE_PROVISION",
    entityType: "Device",
    entityId: device.id,
    metadata: { device_id: deviceId, room_id: room_id ?? null },
  })

  return NextResponse.json(
    {
      id: device.id,
      nama: device.nama,
      device_id: device.deviceId,
      secret: rawSecret, // TAMPIL SEKALI — salin untuk provisioning firmware
      ibeacon: { uuid: device.ibeaconUuid, major: device.ibeaconMajor, minor: device.ibeaconMinor },
      room: device.room
        ? { id: device.room.id, nama: device.room.nama, unit: device.room.workUnit }
        : null,
      status: device.status,
      created_at: device.createdAt,
    },
    { status: 201 },
  )
}
