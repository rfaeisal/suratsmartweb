import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { deleteFaceThumbnail, saveFaceThumbnail, readFaceThumbnail } from "@/lib/face-storage"
import { sendNotification } from "@/lib/notifications"

type Props = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Props) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (
    !session.user.roles.includes("ADMIN_KEPEGAWAIAN") &&
    !session.user.roles.includes("SUPERADMIN")
  ) {
    return Errors.forbidden()
  }

  const { id } = await params

  const enrollment = await prisma.faceEnrollmentSession.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      status: true,
      embedding: true,
      embeddingModelVersion: true,
      thumbnailUrl: true,
      deviceInfo: true,
    },
  })
  if (!enrollment) return Errors.notFound("Sesi enrollment")
  if (enrollment.status !== "SUBMITTED") {
    return Errors.validation(
      `Sesi tidak bisa di-approve dari status ${enrollment.status.toLowerCase()}. Harus SUBMITTED.`,
    )
  }
  if (!enrollment.embedding || !enrollment.thumbnailUrl || !enrollment.embeddingModelVersion) {
    return Errors.validation("Data enrollment tidak lengkap")
  }

  const employee = await prisma.employee.findUnique({
    where: { id: enrollment.employeeId },
    select: { id: true, faceThumbnailUrl: true },
  })
  if (!employee) return Errors.notFound("Pegawai")

  // Pindahkan thumbnail: dari session key ke employee key.
  // Baca file lama → simpan ulang dengan key employeeId → hapus file lama.
  let finalThumbnailUrl: string
  try {
    const buf = await readFaceThumbnail(enrollment.thumbnailUrl)
    finalThumbnailUrl = await saveFaceThumbnail(employee.id, buf)
    await deleteFaceThumbnail(enrollment.thumbnailUrl)
  } catch (err) {
    return Errors.internal(
      `Gagal memindahkan thumbnail: ${err instanceof Error ? err.message : "unknown"}`,
    )
  }

  // Hapus thumbnail employee lama kalau ada (re-enroll case).
  if (employee.faceThumbnailUrl && employee.faceThumbnailUrl !== finalThumbnailUrl) {
    await deleteFaceThumbnail(employee.faceThumbnailUrl)
  }

  const approvedAt = new Date()

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: employee.id },
      data: {
        faceEmbedding: enrollment.embedding,
        faceEmbeddingModelVersion: enrollment.embeddingModelVersion,
        faceThumbnailUrl: finalThumbnailUrl,
        faceEnrolledAt: approvedAt,
        faceEnrollmentDeviceInfo: enrollment.deviceInfo ?? undefined,
      },
    }),
    prisma.faceEnrollmentSession.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt,
        approvedBy: session.user.id,
        thumbnailUrl: finalThumbnailUrl,
      },
    }),
    // Semua sesi pending lain untuk pegawai ini otomatis EXPIRED — hanya boleh 1 aktif.
    prisma.faceEnrollmentSession.updateMany({
      where: {
        employeeId: employee.id,
        status: { in: ["PENDING", "SUBMITTED"] },
        id: { not: id },
      },
      data: { status: "EXPIRED" },
    }),
  ])

  await writeAuditLog({
    actorId: session.user.id,
    action: "FACE_ENROLLMENT_APPROVED",
    entityType: "FaceEnrollmentSession",
    entityId: id,
    metadata: {
      employeeId: employee.id,
      embeddingModelVersion: enrollment.embeddingModelVersion,
    },
  })

  // Notif ke pegawai — cari AppUser dari employeeId.
  const appUser = await prisma.appUser.findUnique({
    where: { employeeId: employee.id },
    select: { id: true },
  })
  if (appUser) {
    sendNotification({
      event: "FACE_ENROLLMENT_APPROVED",
      targetUserId: appUser.id,
      data: { sessionId: id },
    }).catch((e) => console.error("[face-approve] notif gagal:", e))
  }

  return NextResponse.json({ id, status: "APPROVED", approvedAt: approvedAt.toISOString() })
}
