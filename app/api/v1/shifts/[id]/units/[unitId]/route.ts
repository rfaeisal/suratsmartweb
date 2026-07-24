import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; unitId: string }> },
) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id, unitId } = await params
  const shiftUnit = await prisma.shiftUnit.findUnique({
    where: { shiftId_workUnitId: { shiftId: id, workUnitId: unitId } },
  })
  if (!shiftUnit) return Errors.notFound("Mapping shift-unit")

  await prisma.shiftUnit.delete({ where: { shiftId_workUnitId: { shiftId: id, workUnitId: unitId } } })
  return new NextResponse(null, { status: 204 })
}
