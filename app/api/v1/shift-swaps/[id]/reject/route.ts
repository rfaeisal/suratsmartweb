import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"

const bodySchema = z.object({
  alasan: z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id } })
  if (!swap) return Errors.notFound("Permintaan tukar shift")
  if (swap.status === "DISETUJUI" || swap.status === "DITOLAK") {
    return Errors.validation(`Permintaan sudah ${swap.status.toLowerCase()}, tidak dapat ditolak`)
  }

  // Target bisa tolak saat MENUNGGU_TARGET, Kepala bisa tolak saat MENUNGGU_KEPALA
  const isTarget = swap.targetId === auth.employeeId
  const isKepala = auth.roles.includes("KEPALA_UNIT") && (auth.managedWorkUnitId === swap.workUnitId || auth.roles.includes("SUPERADMIN") || auth.roles.includes("ADMIN_KEPEGAWAIAN"))

  if (!isTarget && !isKepala) return Errors.forbidden()
  if (swap.status === "MENUNGGU_TARGET" && !isTarget) {
    return Errors.validation("Hanya pegawai tujuan yang dapat menolak permintaan ini")
  }

  const updated = await prisma.shiftSwapRequest.update({
    where: { id },
    data: {
      status: "DITOLAK",
      rejectedBy: auth.employeeId,
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
    action: "SHIFT_SWAP_REJECT",
    entityType: "ShiftSwapRequest",
    entityId: id,
    metadata: { alasan: parsed.data.alasan },
  })

  // Tentukan siapa yang perlu dinotifikasi berdasarkan siapa yang menolak
  const notifEmployeeIds = isTarget
    ? [swap.requesterId]                          // target tolak → beritahu requester
    : [swap.requesterId, swap.targetId]           // kepala tolak → beritahu keduanya
  const rejectedBy = isTarget ? "TARGET" : "KEPALA"

  const usersToNotify = await prisma.appUser.findMany({
    where: { employeeId: { in: notifEmployeeIds } },
    select: { id: true },
  })
  await Promise.all(
    usersToNotify.map((u) =>
      sendNotification({
        event: "SHIFT_SWAP_REJECTED",
        targetUserId: u.id,
        data: { shiftSwapId: id, rejectedBy },
      })
    )
  )

  return NextResponse.json(updated)
}
