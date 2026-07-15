import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

type Props = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Props) {
  try {
    await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
    const { id } = await params

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            fullName: true,
            nip: true,
            positionTitle: true,
            employeeType: true,
            unit: { select: { name: true } },
          },
        },
        leaveType: { select: { code: true, name: true } },
        delegate: { select: { fullName: true, positionTitle: true } },
        attachments: { select: { id: true, fileName: true, uploadedAt: true } },
        approvalSteps: {
          include: { approver: { select: { fullName: true, positionTitle: true, nip: true } } },
          orderBy: { stepOrder: "asc" },
        },
        skDocument: true,
      },
    })

    if (!request) return Errors.notFound("Pengajuan tidak ditemukan")
    return NextResponse.json(request)
  } catch (err) {
    if (err instanceof AuthError) return Errors[err.code === "FORBIDDEN" ? "forbidden" : err.code === "SESSION_REVOKED" ? "sessionRevoked" : "unauthorized"]()
    return Errors.internal()
  }
}
