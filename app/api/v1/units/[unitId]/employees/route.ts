import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

type RouteParams = { params: Promise<{ unitId: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  let user
  try {
    user = await requireAuth(req)
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { unitId } = await params

  const unit = await prisma.workUnit.findUnique({ where: { id: unitId } })
  if (!unit) return Errors.notFound("Unit kerja")

  const employees = await prisma.employee.findMany({
    where: {
      unitId,
      isActive: true,
      NOT: { id: user.employeeId }, // kecualikan diri sendiri dari daftar delegasi
    },
    select: {
      id: true,
      nip: true,
      fullName: true,
      positionTitle: true,
      employeeType: true,
    },
    orderBy: { fullName: "asc" },
  })

  return NextResponse.json(employees)
}
