import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const shiftUnits = await prisma.shiftUnit.findMany({
    where: { shiftId: id },
    include: { workUnit: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ data: shiftUnits.map((su) => su.workUnit) })
}

const bodySchema = z.object({ work_unit_id: z.string().min(1) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return Errors.notFound("Shift")

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const workUnit = await prisma.workUnit.findUnique({ where: { id: parsed.data.work_unit_id } })
  if (!workUnit) return Errors.notFound("Unit kerja")

  const existing = await prisma.shiftUnit.findUnique({
    where: { shiftId_workUnitId: { shiftId: id, workUnitId: parsed.data.work_unit_id } },
  })
  if (existing) return Errors.conflict("Shift sudah dipetakan ke unit ini")

  const created = await prisma.shiftUnit.create({
    data: { shiftId: id, workUnitId: parsed.data.work_unit_id },
    select: { id: true, workUnitId: true },
  })
  return NextResponse.json(created, { status: 201 })
}
