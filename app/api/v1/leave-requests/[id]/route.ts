import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

type RouteParams = { params: Promise<{ id: string }> }

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

  const { id } = await params

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { nip: true, fullName: true, positionTitle: true, unit: { select: { name: true } } } },
      leaveType: { select: { code: true, name: true } },
      delegate: { select: { nip: true, fullName: true, positionTitle: true } },
      attachments: { select: { id: true, fileName: true, uploadedAt: true } },
      approvalSteps: {
        include: { approver: { select: { fullName: true, positionTitle: true } } },
        orderBy: { stepOrder: "asc" },
      },
      skDocument: { select: { skNumber: true, filePath: true, generatedAt: true } },
    },
  })

  if (!leaveRequest) return Errors.notFound("Pengajuan cuti")

  const isOwner = leaveRequest.requesterId === user.employeeId
  const isDelegate = leaveRequest.delegateId === user.employeeId
  const isApprover = leaveRequest.approvalSteps.some((s) => s.approverId === user.employeeId)
  const isAdmin = user.roles.includes("ADMIN_KEPEGAWAIAN") || user.roles.includes("SUPERADMIN")

  if (!isOwner && !isDelegate && !isApprover && !isAdmin) {
    return Errors.forbidden()
  }

  return NextResponse.json(leaveRequest)
}
