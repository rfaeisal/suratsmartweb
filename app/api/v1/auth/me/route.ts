import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

export async function GET(req: NextRequest) {
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

  const appUser = await prisma.appUser.findUnique({
    where: { id: user.userId },
    include: { employee: { include: { unit: true } } },
  })

  if (!appUser) return Errors.notFound("User")

  return NextResponse.json({
    id: appUser.id,
    nip: appUser.employee.nip,
    fullName: appUser.employee.fullName,
    employeeType: appUser.employee.employeeType,
    roles: appUser.roles,
    unit: { id: appUser.employee.unit.id, name: appUser.employee.unit.name },
  })
}
