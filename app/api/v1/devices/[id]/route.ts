import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

const patchSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  room_id: z.string().min(1).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const device = await prisma.device.findUnique({ where: { id } })
  if (!device) return Errors.notFound("Perangkat")

  if (parsed.data.room_id !== undefined && parsed.data.room_id !== null) {
    const room = await prisma.room.findUnique({ where: { id: parsed.data.room_id } })
    if (!room) return Errors.notFound("Ruangan")
  }

  const updated = await prisma.device.update({
    where: { id },
    data: {
      ...(parsed.data.nama !== undefined && { nama: parsed.data.nama }),
      ...(parsed.data.room_id !== undefined && { roomId: parsed.data.room_id }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
    },
    include: {
      room: { select: { id: true, nama: true, workUnit: { select: { id: true, name: true } } } },
    },
  })

  return NextResponse.json({
    id: updated.id,
    nama: updated.nama,
    device_id: updated.deviceId,
    status: updated.status,
    room: updated.room
      ? { id: updated.room.id, nama: updated.room.nama, unit: updated.room.workUnit }
      : null,
  })
}
