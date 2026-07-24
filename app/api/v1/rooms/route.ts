import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

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

  const workUnitId = new URL(req.url).searchParams.get("work_unit_id")

  const rooms = await prisma.room.findMany({
    where: workUnitId ? { workUnitId } : undefined,
    include: { workUnit: { select: { id: true, name: true } } },
    orderBy: { nama: "asc" },
  })

  return NextResponse.json({
    data: rooms.map((r) => ({
      id: r.id,
      nama: r.nama,
      kode: r.kode,
      work_unit: r.workUnit,
    })),
  })
}

const createSchema = z.object({
  nama: z.string().min(1).max(100),
  kode: z.string().min(1).max(20),
  work_unit_id: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
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

  const workUnit = await prisma.workUnit.findUnique({ where: { id: parsed.data.work_unit_id } })
  if (!workUnit) return Errors.notFound("Unit kerja")

  const existing = await prisma.room.findUnique({ where: { kode: parsed.data.kode } })
  if (existing) return Errors.conflict("Kode ruangan sudah dipakai")

  const room = await prisma.room.create({
    data: { nama: parsed.data.nama, kode: parsed.data.kode, workUnitId: parsed.data.work_unit_id },
  })

  return NextResponse.json({ id: room.id, nama: room.nama, kode: room.kode, work_unit_id: room.workUnitId }, { status: 201 })
}
