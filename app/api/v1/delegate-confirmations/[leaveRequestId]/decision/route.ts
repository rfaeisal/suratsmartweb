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
      requester: {
        select: {
          fullName: true,
          unit: {
            select: {
              kepalaRuanganId: true,
              kepalaRuangan: { select: { id: true, fullName: true } },
            },
          },
        },
      },
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

  if (decision === "DECLINED") {
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: "DELEGATE_DECLINED",
        delegateConfirmationStatus: "DECLINED",
        delegateDecidedAt: new Date(),
        delegateNote: note,
      },
    })

    await writeAuditLog({
      actorId: user.userId,
      action: "DELEGATE_DECLINED",
      entityType: "LeaveRequest",
      entityId: leaveRequestId,
      metadata: { note },
    })

    const requesterUser = await prisma.appUser.findUnique({
      where: { employeeId: leaveRequest.requesterId },
    })
    if (requesterUser) {
      await sendNotification({
        event: "DELEGATE_DECLINED",
        targetUserId: requesterUser.id,
        data: { leaveType: leaveRequest.leaveType.name, note: note ?? "" },
      })
    }

    return NextResponse.json({ success: true, newStatus: "DELEGATE_DECLINED" })
  }

  // ─── CONFIRMED ──────────────────────────────────────────────────────────────

  const kepalaRuanganId = leaveRequest.requester.unit?.kepalaRuanganId ?? null

  if (kepalaRuanganId) {
    // Pegawai ini punya kepala ruangan → otomatis buat step approval + ubah status
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          status: "PENDING_KEPALA_RUANGAN",
          delegateConfirmationStatus: "CONFIRMED",
          delegateDecidedAt: new Date(),
          currentStepOrder: 1,
        },
      })

      await tx.approvalStep.create({
        data: {
          leaveRequestId,
          stepOrder: 1,
          approverId: kepalaRuanganId,
          roleLabel: "Kepala Ruangan",
          status: "PENDING",
        },
      })
    })

    // Notifikasi ke kepala ruangan
    const kepalaUser = await prisma.appUser.findUnique({
      where: { employeeId: kepalaRuanganId },
    })
    if (kepalaUser) {
      await sendNotification({
        event: "APPROVAL_REQUESTED",
        targetUserId: kepalaUser.id,
        data: {
          requesterName: leaveRequest.requester.fullName,
          leaveType: leaveRequest.leaveType.name,
          role: "Kepala Ruangan",
        },
      })
    }

    // Notifikasi ke pegawai pengaju (info: menunggu kepala ruangan)
    const requesterUser = await prisma.appUser.findUnique({
      where: { employeeId: leaveRequest.requesterId },
    })
    if (requesterUser) {
      await sendNotification({
        event: "APPROVAL_REQUESTED",
        targetUserId: requesterUser.id,
        data: {
          leaveType: leaveRequest.leaveType.name,
          message: `Pengganti menyetujui. Menunggu persetujuan Kepala Ruangan (${leaveRequest.requester.unit?.kepalaRuangan?.fullName ?? ""}).`,
        },
      })
    }

    await writeAuditLog({
      actorId: user.userId,
      action: "DELEGATE_CONFIRMED",
      entityType: "LeaveRequest",
      entityId: leaveRequestId,
      metadata: { kepalaRuanganId, autoStep: true },
    })

    return NextResponse.json({ success: true, newStatus: "PENDING_KEPALA_RUANGAN" })
  }

  // Tidak ada kepala ruangan → langsung ke admin kepegawaian (alur lama)
  await prisma.leaveRequest.update({
    where: { id: leaveRequestId },
    data: {
      status: "PENDING_ADMIN_REVIEW",
      delegateConfirmationStatus: "CONFIRMED",
      delegateDecidedAt: new Date(),
    },
  })

  await writeAuditLog({
    actorId: user.userId,
    action: "DELEGATE_CONFIRMED",
    entityType: "LeaveRequest",
    entityId: leaveRequestId,
    metadata: { kepalaRuanganId: null, autoStep: false },
  })

  const requesterUser = await prisma.appUser.findUnique({
    where: { employeeId: leaveRequest.requesterId },
  })
  if (requesterUser) {
    await sendNotification({
      event: "APPROVAL_REQUESTED",
      targetUserId: requesterUser.id,
      data: { leaveType: leaveRequest.leaveType.name },
    })
  }

  return NextResponse.json({ success: true, newStatus: "PENDING_ADMIN_REVIEW" })
}
