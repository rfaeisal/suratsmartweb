import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

const bodySchema = z.object({
  alasan: z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let auth
  try {
    auth = await requireAuth(req, ["KEPALA_UNIT", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const overtime = await prisma.overtime.findUnique({ where: { id } })
  if (!overtime) return Errors.notFound("Lembur")
  if (overtime.status === "DITOLAK" || overtime.status === "SAH") {
    return Errors.validation(`Lembur dengan status ${overtime.status} tidak dapat ditolak`)
  }
  if (auth.roles.includes("KEPALA_UNIT") && auth.managedWorkUnitId && overtime.workUnitId !== auth.managedWorkUnitId) {
    return Errors.forbidden()
  }

  const updated = await prisma.overtime.update({
    where: { id },
    data: {
      status: "DITOLAK",
      rejectedBy: auth.userId,
      rejectedAt: new Date(),
      note: parsed.data.alasan ?? overtime.note,
    },
    include: {
      employee: { select: { id: true, fullName: true, nip: true } },
      workUnit: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    actorId: auth.userId,
    action: "OVERTIME_REJECT",
    entityType: "Overtime",
    entityId: id,
    metadata: { employeeId: overtime.employeeId, alasan: parsed.data.alasan },
  })

  return NextResponse.json(updated)
}
