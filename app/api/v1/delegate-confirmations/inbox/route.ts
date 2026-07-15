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

  const requests = await prisma.leaveRequest.findMany({
    where: {
      delegateId: user.employeeId,
      delegateConfirmationStatus: "PENDING",
      status: "SUBMITTED",
    },
    include: {
      requester: { select: { nip: true, fullName: true, positionTitle: true, unit: { select: { name: true } } } },
      leaveType: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(requests)
}
