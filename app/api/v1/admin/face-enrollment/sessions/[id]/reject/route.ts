import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { deleteFaceThumbnail } from "@/lib/face-storage"
import { sendNotification } from "@/lib/notifications"

const bodySchema = z.object({
  reason: z.string().min(3).max(500),
})

type Props = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (
    !session.user.roles.includes("ADMIN_KEPEGAWAIAN") &&
    !session.user.roles.includes("SUPERADMIN")
  ) {
    return Errors.forbidden()
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Alasan penolakan wajib (min 3 char)")

  const enrollment = await prisma.faceEnrollmentSession.findUnique({
    where: { id },
    select: { id: true, employeeId: true, status: true, thumbnailUrl: true },
  })
  if (!enrollment) return Errors.notFound("Sesi enrollment")
  if (enrollment.status !== "SUBMITTED" && enrollment.status !== "PENDING") {
    return Errors.validation(
      `Sesi tidak bisa di-reject dari status ${enrollment.status.toLowerCase()}.`,
    )
  }

  const rejectedAt = new Date()

  await prisma.faceEnrollmentSession.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectedAt,
      rejectedBy: session.user.id,
      rejectReason: parsed.data.reason,
    },
  })

  // Bersihkan thumbnail — data biometrik jangan dibiarkan berlama-lama di storage
  // untuk enrollment yang di-reject.
  if (enrollment.thumbnailUrl) {
    await deleteFaceThumbnail(enrollment.thumbnailUrl)
    await prisma.faceEnrollmentSession.update({
      where: { id },
      data: { thumbnailUrl: null, embedding: null },
    })
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "FACE_ENROLLMENT_REJECTED",
    entityType: "FaceEnrollmentSession",
    entityId: id,
    metadata: { employeeId: enrollment.employeeId, reason: parsed.data.reason },
  })

  const appUser = await prisma.appUser.findUnique({
    where: { employeeId: enrollment.employeeId },
    select: { id: true },
  })
  if (appUser) {
    sendNotification({
      event: "FACE_ENROLLMENT_REJECTED",
      targetUserId: appUser.id,
      data: { sessionId: id, reason: parsed.data.reason },
    }).catch((e) => console.error("[face-reject] notif gagal:", e))
  }

  return NextResponse.json({ id, status: "REJECTED", rejectedAt: rejectedAt.toISOString() })
}
