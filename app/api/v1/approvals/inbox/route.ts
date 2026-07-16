import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)

    // Langkah-langkah yang menunggu keputusan user ini, dan merupakan langkah aktif
    const steps = await prisma.approvalStep.findMany({
      where: {
        approverId: user.employeeId,
        status: "PENDING",
        leaveRequest: {
          status: { in: ["IN_APPROVAL", "PENDING_KEPALA_RUANGAN"] },
          currentStepOrder: { gt: 0 },
        },
      },
      include: {
        leaveRequest: {
          select: {
            id: true,
            requestNumber: true,
            status: true,
            currentStepOrder: true,
            startDate: true,
            endDate: true,
            totalDays: true,
            reason: true,
            requester: {
              select: { fullName: true, nip: true, positionTitle: true, unit: { select: { name: true } } },
            },
            leaveType: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // Filter: hanya tampilkan jika stepOrder ini adalah currentStepOrder
    const activeSteps = steps.filter(
      (s) => s.stepOrder === s.leaveRequest.currentStepOrder
    )

    return NextResponse.json({ steps: activeSteps })
  } catch (err) {
    if (err instanceof AuthError)
      return Errors[
        err.code === "FORBIDDEN"
          ? "forbidden"
          : err.code === "SESSION_REVOKED"
          ? "sessionRevoked"
          : "unauthorized"
      ]()
    return Errors.internal()
  }
}
