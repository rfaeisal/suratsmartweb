import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { generateAndSaveSkPdf } from "@/lib/sk-generator"

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

    if (leaveRequest.status !== "APPROVED") {
      return Errors.invalidApprovalState("SK hanya dapat digenerate untuk pengajuan yang sudah APPROVED")
    }

    // Jika SK sudah ada, hapus dulu untuk regenerate
    if (leaveRequest.skDocument) {
      await prisma.skDocument.delete({ where: { leaveRequestId: id } })
    }

    const { skNumber, filePath } = await generateAndSaveSkPdf(id)

    await prisma.skDocument.create({
      data: { leaveRequestId: id, skNumber, filePath },
    })

    await writeAuditLog({
      actorId: user.employeeId,
      action: "GENERATE_SK",
      entityType: "LeaveRequest",
      entityId: id,
      metadata: { skNumber },
    })

    return NextResponse.json({ skNumber })
  } catch (err) {
    if (err instanceof AuthError)
      return Errors[
        err.code === "FORBIDDEN" ? "forbidden" : err.code === "SESSION_REVOKED" ? "sessionRevoked" : "unauthorized"
      ]()
    console.error("[generate-sk]", err)
    return Errors.internal()
  }
}
