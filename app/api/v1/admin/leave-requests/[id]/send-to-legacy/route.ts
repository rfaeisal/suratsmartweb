import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { pushLeaveToLegacy } from "@/lib/legacy/push-leave"

type Props = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const user = await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
    const { id } = await params

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { skDocument: true },
    })
    if (!leaveRequest) return Errors.notFound("Pengajuan tidak ditemukan")

    if (!leaveRequest.skDocument) {
      return Errors.invalidApprovalState("SK harus digenerate terlebih dahulu sebelum mengirim ke sistem lama")
    }

    if (leaveRequest.status === "SENT_TO_LEGACY") {
      return Errors.conflict("Pengajuan ini sudah berhasil dikirim ke sistem lama")
    }

    if (leaveRequest.status !== "APPROVED" && leaveRequest.status !== "SEND_FAILED") {
      return Errors.invalidApprovalState("Hanya pengajuan berstatus APPROVED atau SEND_FAILED yang dapat dikirim")
    }

    await pushLeaveToLegacy(id)

    await writeAuditLog({
      actorId: user.employeeId,
      action: "SEND_TO_LEGACY",
      entityType: "LeaveRequest",
      entityId: id,
    })

    const updated = await prisma.leaveRequest.findUnique({ where: { id }, select: { status: true } })
    return NextResponse.json({ status: updated?.status })
  } catch (err) {
    if (err instanceof AuthError)
      return Errors[
        err.code === "FORBIDDEN" ? "forbidden" : err.code === "SESSION_REVOKED" ? "sessionRevoked" : "unauthorized"
      ]()
    console.error("[send-to-legacy]", err)
    return Errors.internal()
  }
}
