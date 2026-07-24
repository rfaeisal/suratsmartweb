import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let auth
  try {
    auth = await requireAuth(req, ["ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const overtime = await prisma.overtime.findUnique({ where: { id } })
  if (!overtime) return Errors.notFound("Lembur")
  if (overtime.status !== "DISETUJUI_UNIT") {
    return Errors.validation(`Status lembur harus DISETUJUI_UNIT, bukan ${overtime.status}`)
  }

  const updated = await prisma.overtime.update({
    where: { id },
    data: {
      status: "SAH",
      approvedHrBy: auth.userId,
      approvedHrAt: new Date(),
    },
    include: {
      employee: { select: { id: true, fullName: true, nip: true } },
      workUnit: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    actorId: auth.userId,
    action: "OVERTIME_APPROVE_HR",
    entityType: "Overtime",
    entityId: id,
    metadata: { employeeId: overtime.employeeId },
  })

  return NextResponse.json(updated)
}
