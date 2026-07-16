import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { z } from "zod"

const schema = z.object({
  steps: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        roleLabel: z.string().max(100).optional().default(""),
      })
    )
    .min(1)
    .max(10),
})

type Props = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const user = await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
    const { id } = await params

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return Errors.validation("Format data tidak valid")

    const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } })
    if (!leaveRequest) return Errors.notFound("Pengajuan tidak ditemukan")

    // Gate: hanya untuk status PENDING_ADMIN_REVIEW
    if (leaveRequest.status !== "PENDING_ADMIN_REVIEW") {
      return Errors.invalidApprovalState(
        "Alur approval hanya dapat ditetapkan untuk pengajuan berstatus PENDING_ADMIN_REVIEW"
      )
    }

    // Gate: delegasi harus sudah dikonfirmasi
    if (leaveRequest.delegateConfirmationStatus !== "CONFIRMED") {
      return Errors.invalidApprovalState(
        "Konfirmasi delegasi belum diterima. Alur approval tidak dapat ditetapkan sebelum pengganti menyetujui."
      )
    }

    const { steps } = parsed.data

    // Validasi semua employeeId ada
    const employees = await prisma.employee.findMany({
      where: { id: { in: steps.map((s) => s.employeeId) }, isActive: true },
      select: { id: true },
    })
    const foundIds = new Set(employees.map((e) => e.id))
    const missing = steps.filter((s) => !foundIds.has(s.employeeId))
    if (missing.length > 0) {
      return Errors.validation("Beberapa pegawai approver tidak ditemukan atau tidak aktif")
    }

    await prisma.$transaction(async (tx) => {
      // Ambil step yang sudah APPROVED (kepala ruangan) — jangan dihapus
      const approvedSteps = await tx.approvalStep.findMany({
        where: { leaveRequestId: id, status: "APPROVED" },
        orderBy: { stepOrder: "asc" },
      })
      const stepOffset = approvedSteps.length > 0
        ? Math.max(...approvedSteps.map((s) => s.stepOrder))
        : 0

      // Hapus hanya step yang belum diputuskan (PENDING)
      await tx.approvalStep.deleteMany({
        where: { leaveRequestId: id, status: { not: "APPROVED" } },
      })

      // Buat step baru mulai setelah step yang sudah APPROVED
      await tx.approvalStep.createMany({
        data: steps.map((s, idx) => ({
          leaveRequestId: id,
          stepOrder: stepOffset + idx + 1,
          approverId: s.employeeId,
          roleLabel: s.roleLabel,
          status: "PENDING",
        })),
      })

      await tx.leaveRequest.update({
        where: { id },
        data: { status: "IN_APPROVAL", currentStepOrder: stepOffset + 1 },
      })
    })

    await writeAuditLog({
      actorId: user.employeeId,
      action: "SET_APPROVAL_FLOW",
      entityType: "LeaveRequest",
      entityId: id,
      metadata: { steps },
    })

    return NextResponse.json({ success: true }, { status: 200 })
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
