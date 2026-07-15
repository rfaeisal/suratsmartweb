import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"
import { Errors } from "@/lib/errors"

const schema = z.object({
  decision: z.enum(["CONFIRMED", "DECLINED"]),
  note: z.string().optional(),
}).refine(
  (d) => d.decision === "CONFIRMED" || (d.note && d.note.trim().length > 0),
  { message: "Catatan wajib diisi jika menolak", path: ["note"] },
)

type RouteParams = { params: Promise<{ leaveRequestId: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
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

  const { leaveRequestId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Data tidak valid", parsed.error.flatten().fieldErrors)
  }

  const { decision, note } = parsed.data

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      requester: { select: { fullName: true } },
      leaveType: { select: { name: true } },
    },
  })

  if (!leaveRequest) return Errors.notFound("Pengajuan cuti")

  if (leaveRequest.delegateId !== user.employeeId) {
    return Errors.forbidden("Anda bukan pegawai pengganti untuk pengajuan ini")
  }

  if (leaveRequest.status !== "SUBMITTED" || leaveRequest.delegateConfirmationStatus !== "PENDING") {
    return Errors.invalidApprovalState(
      "Pengajuan ini sudah tidak dalam status menunggu konfirmasi delegasi",
    )
  }

  const newStatus = decision === "CONFIRMED" ? "PENDING_ADMIN_REVIEW" : "DELEGATE_DECLINED"
  const newDelegateStatus = decision === "CONFIRMED" ? "CONFIRMED" : "DECLINED"

  await prisma.leaveRequest.update({
    where: { id: leaveRequestId },
    data: {
      status: newStatus,
      delegateConfirmationStatus: newDelegateStatus,
      delegateDecidedAt: new Date(),
      delegateNote: note,
    },
  })

  await writeAuditLog({
    actorId: user.userId,
    action: `DELEGATE_${decision}`,
    entityType: "LeaveRequest",
    entityId: leaveRequestId,
    metadata: { note },
  })

  // Notifikasi ke pegawai pengaju
  const requesterUser = await prisma.appUser.findUnique({
    where: { employeeId: leaveRequest.requesterId },
  })
  if (requesterUser) {
    await sendNotification({
      event: decision === "CONFIRMED" ? "APPROVAL_REQUESTED" : "DELEGATE_DECLINED",
      targetUserId: requesterUser.id,
      data: {
        leaveType: leaveRequest.leaveType.name,
        decision,
        note: note ?? "",
      },
    })
  }

  return NextResponse.json({ success: true, newStatus })
}
