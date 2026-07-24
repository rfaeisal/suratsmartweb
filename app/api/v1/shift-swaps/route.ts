import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

const createSchema = z.object({
  requester_roster_id: z.string().min(1),
  target_roster_id: z.string().min(1),
  alasan: z.string().max(500).optional(),
})

export async function GET(req: NextRequest) {
  let auth
  try {
    auth = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const workUnitId = searchParams.get("work_unit_id")

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (workUnitId) where.workUnitId = workUnitId

  if (auth.roles.includes("PEGAWAI") && !auth.roles.some((r) => ["KEPALA_UNIT", "ADMIN_KEPEGAWAIAN", "SUPERADMIN"].includes(r))) {
    where.OR = [{ requesterId: auth.employeeId }, { targetId: auth.employeeId }]
  } else if (auth.roles.includes("KEPALA_UNIT") && !auth.roles.some((r) => ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"].includes(r))) {
    where.workUnitId = auth.managedWorkUnitId ?? "__none__"
  }

  const swaps = await prisma.shiftSwapRequest.findMany({
    where,
    include: {
      requester: { select: { id: true, fullName: true, nip: true } },
      target: { select: { id: true, fullName: true, nip: true } },
      requesterRoster: { include: { shift: { select: { id: true, nama: true } } } },
      targetRoster: { include: { shift: { select: { id: true, nama: true } } } },
      workUnit: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ data: swaps })
}

export async function POST(req: NextRequest) {
  let auth
  try {
    auth = await requireAuth(req, ["PEGAWAI"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const { requester_roster_id, target_roster_id, alasan } = parsed.data

  const [requesterRoster, targetRoster] = await Promise.all([
    prisma.roster.findUnique({ where: { id: requester_roster_id } }),
    prisma.roster.findUnique({ where: { id: target_roster_id } }),
  ])

  if (!requesterRoster) return Errors.notFound("Roster pemohon")
  if (!targetRoster) return Errors.notFound("Roster tujuan")
  if (requesterRoster.employeeId !== auth.employeeId) return Errors.forbidden()
  if (requesterRoster.workUnitId !== targetRoster.workUnitId) {
    return Errors.validation("Tukar shift hanya bisa dalam unit kerja yang sama")
  }
  if (requesterRoster.employeeId === targetRoster.employeeId) {
    return Errors.validation("Tidak dapat tukar shift dengan diri sendiri")
  }

  const pending = await prisma.shiftSwapRequest.findFirst({
    where: {
      requesterRosterId: requester_roster_id,
      status: { in: ["MENUNGGU_TARGET", "MENUNGGU_KEPALA"] },
    },
  })
  if (pending) return Errors.validation("Sudah ada permintaan tukar shift yang sedang diproses untuk roster ini")

  const swap = await prisma.shiftSwapRequest.create({
    data: {
      requesterId: auth.employeeId,
      targetId: targetRoster.employeeId,
      requesterRosterId: requester_roster_id,
      targetRosterId: target_roster_id,
      workUnitId: requesterRoster.workUnitId,
      alasan,
    },
    include: {
      requester: { select: { id: true, fullName: true, nip: true } },
      target: { select: { id: true, fullName: true, nip: true } },
      requesterRoster: { include: { shift: { select: { id: true, nama: true } } } },
      targetRoster: { include: { shift: { select: { id: true, nama: true } } } },
      workUnit: { select: { id: true, name: true } },
    },
  })

  await writeAuditLog({
    actorId: auth.userId,
    action: "SHIFT_SWAP_REQUEST",
    entityType: "ShiftSwapRequest",
    entityId: swap.id,
    metadata: { targetId: targetRoster.employeeId },
  })

  return NextResponse.json(swap, { status: 201 })
}
