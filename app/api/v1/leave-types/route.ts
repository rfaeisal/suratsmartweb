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

  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  })
  if (!employee) return Errors.notFound("Pegawai")

  const currentYear = new Date().getFullYear()

  const leaveTypes = await prisma.leaveType.findMany({
    where: {
      isActive: true,
      applicableTo: { has: employee.employeeType },
    },
    include: {
      quotas: {
        where: { employeeId: user.employeeId, year: currentYear },
        select: { totalDays: true, usedDays: true },
      },
    },
    orderBy: { name: "asc" },
  })

  const result = leaveTypes.map((lt) => {
    const quota = lt.quotas[0]
    return {
      id: lt.id,
      code: lt.code,
      name: lt.name,
      requiresAttachment: lt.requiresAttachment,
      remainingDays: quota ? quota.totalDays - quota.usedDays : null,
    }
  })

  return NextResponse.json(result)
}
