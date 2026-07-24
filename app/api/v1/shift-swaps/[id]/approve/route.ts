import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let auth
  try {
    auth = await requireAuth(req, ["KEPALA_UNIT"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id },
    include: {
      requesterRoster: true,
      targetRoster: true,
    },
  })
  if (!swap) return Errors.notFound("Permintaan tukar shift")
  if (swap.status !== "MENUNGGU_KEPALA") {
    return Errors.validation(`Status harus MENUNGGU_KEPALA, bukan ${swap.status}`)
  }
  if (auth.managedWorkUnitId && swap.workUnitId !== auth.managedWorkUnitId) {
    return Errors.forbidden()
  }

  // Tukar shift di roster: requester pakai shiftId target, target pakai shiftId requester
  const [updated] = await prisma.$transaction([
    prisma.shiftSwapRequest.update({
      where: { id },
      data: {
        status: "DISETUJUI",
        approvedByUnitId: auth.userId,
        approvedByUnitAt: new Date(),
      },
    }),
    prisma.roster.update({
      where: { id: swap.requesterRosterId },
      data: { shiftId: swap.targetRoster.shiftId },
    }),
    prisma.roster.update({
      where: { id: swap.targetRosterId },
      data: { shiftId: swap.requesterRoster.shiftId },
    }),
  ])

  const result = await prisma.shiftSwapRequest.findUnique({
    where: { id },
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
    action: "SHIFT_SWAP_APPROVE",
    entityType: "ShiftSwapRequest",
    entityId: id,
    metadata: { requesterId: swap.requesterId, targetId: swap.targetId },
  })

  // Notifikasi ke requester dan target bahwa tukar shift disetujui
  const usersToNotify = await prisma.appUser.findMany({
    where: { employeeId: { in: [swap.requesterId, swap.targetId] } },
    select: { id: true },
  })
  await Promise.all(
    usersToNotify.map((u) =>
      sendNotification({
        event: "SHIFT_SWAP_APPROVED",
        targetUserId: u.id,
        data: { shiftSwapId: id },
      })
    )
  )

  return NextResponse.json(result)
}
