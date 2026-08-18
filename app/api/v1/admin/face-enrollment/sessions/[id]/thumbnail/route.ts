import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { readFaceThumbnail } from "@/lib/face-storage"

type Props = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Props) {
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
    select: { id: true, employeeId: true, thumbnailUrl: true, status: true },
  })
  if (!enrollment) return Errors.notFound("Sesi enrollment")
  if (!enrollment.thumbnailUrl) return Errors.notFound("Thumbnail sesi")

  let buf: Buffer
  try {
    buf = await readFaceThumbnail(enrollment.thumbnailUrl)
  } catch {
    return Errors.internal("Gagal membaca thumbnail")
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "FACE_ENROLLMENT_THUMBNAIL_VIEWED",
    entityType: "FaceEnrollmentSession",
    entityId: id,
    metadata: { employeeId: enrollment.employeeId },
  })

  const body = new Uint8Array(new ArrayBuffer(buf.byteLength))
  body.set(buf)

  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "Content-Length": String(buf.byteLength),
    },
  })
}
