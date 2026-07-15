import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"
import { z } from "zod"

const schema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
  note: z.string().max(500).optional(),
})

type Props = { params: Promise<{ stepId: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const user = await requireAuth(req)
    const { stepId } = await params

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return Errors.validation("Format data tidak valid")

    const { decision, note } = parsed.data
    if ((decision === "REJECTED" || decision === "RETURNED") && !note?.trim()) {
      return Errors.validation("Catatan wajib diisi untuk penolakan atau pengembalian")
    }

    const step = await prisma.approvalStep.findUnique({
      where: { id: stepId },
      include: {
        leaveRequest: {
          include: {
            approvalSteps: { orderBy: { stepOrder: "asc" } },
            requester: { select: { user: { select: { id: true } } } },
          },
        },
      },
    })

    if (!step) return Errors.notFound("Langkah approval tidak ditemukan")
    if (step.approverId !== user.employeeId) return Errors.forbidden()
    if (step.status !== "PENDING") {
      return Errors.invalidApprovalState("Langkah ini sudah diputuskan sebelumnya")
    }
    if (step.leaveRequest.status !== "IN_APPROVAL") {
      return Errors.invalidApprovalState("Pengajuan tidak dalam status IN_APPROVAL")
    }
    if (step.stepOrder !== step.leaveRequest.currentStepOrder) {
      return Errors.invalidApprovalState("Bukan giliran Anda untuk memutuskan langkah ini")
    }

    const allSteps = step.leaveRequest.approvalSteps
    const isLastStep = step.stepOrder === Math.max(...allSteps.map((s: { stepOrder: number }) => s.stepOrder))
    const leaveRequestId = step.leaveRequestId
    const requesterAppUserId = step.leaveRequest.requester.user?.id

    await prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: stepId },
        data: { status: decision, note: note ?? null, decidedAt: new Date() },
      })

      if (decision === "APPROVED") {
        if (isLastStep) {
          await tx.leaveRequest.update({
            where: { id: leaveRequestId },
            data: { status: "APPROVED", currentStepOrder: step.stepOrder },
          })
        } else {
          await tx.leaveRequest.update({
            where: { id: leaveRequestId },
            data: { currentStepOrder: step.stepOrder + 1 },
          })
        }
      } else {
        await tx.leaveRequest.update({
          where: { id: leaveRequestId },
          data: {
            status: decision === "REJECTED" ? "REJECTED" : "RETURNED",
            currentStepOrder: step.stepOrder,
          },
        })
      }
    })

    await writeAuditLog({
      actorId: user.employeeId,
      action: `APPROVAL_${decision}`,
      entityType: "ApprovalStep",
      entityId: stepId,
      metadata: { leaveRequestId, note: note ?? null, stepOrder: step.stepOrder },
    })

    if (decision === "APPROVED" && !isLastStep) {
      // Notifikasi ke approver berikutnya
      const nextStep = allSteps.find((s: { stepOrder: number }) => s.stepOrder === step.stepOrder + 1) as
        | { approverId: string }
        | undefined
      if (nextStep) {
        const nextApproverUser = await prisma.appUser.findUnique({
          where: { employeeId: nextStep.approverId },
        })
        if (nextApproverUser) {
          await sendNotification({
            event: "APPROVAL_REQUESTED",
            targetUserId: nextApproverUser.id,
            data: { leaveRequestId },
          })
        }
      }
    } else if (requesterAppUserId) {
      // Notifikasi ke pengaju: approved (final), rejected, atau returned
      const eventMap = {
        APPROVED: "REQUEST_APPROVED",
        REJECTED: "REQUEST_REJECTED",
        RETURNED: "REQUEST_RETURNED",
      } as const
      await sendNotification({
        event: eventMap[decision],
        targetUserId: requesterAppUserId,
        data: { leaveRequestId },
      })
    }

    return NextResponse.json({ success: true })
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
