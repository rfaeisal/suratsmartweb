import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id } })
  if (!swap) return Errors.notFound("Permintaan tukar shift")
  if (swap.status !== "MENUNGGU_TARGET") {
    return Errors.validation(`Status tidak valid: ${swap.status}`)
  }
  if (swap.targetId !== auth.employeeId) return Errors.forbidden()

  const updated = await prisma.shiftSwapRequest.update({
    where: { id },
    data: { status: "MENUNGGU_KEPALA" },
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
    action: "SHIFT_SWAP_ACCEPT",
    entityType: "ShiftSwapRequest",
    entityId: id,
    metadata: { requesterId: swap.requesterId },
  })

  return NextResponse.json(updated)
}
