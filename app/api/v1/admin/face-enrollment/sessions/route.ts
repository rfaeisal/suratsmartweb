import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { FACE_ENROLLMENT, generateEnrollmentToken } from "@/lib/face-embedding"

const bodySchema = z.object({
  employeeId: z.string().min(1),
})

const STATUS_FILTER = ["PENDING", "SUBMITTED", "APPROVED", "REJECTED", "EXPIRED"] as const
type StatusFilter = (typeof STATUS_FILTER)[number]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (
    !session.user.roles.includes("ADMIN_KEPEGAWAIAN") &&
    !session.user.roles.includes("SUPERADMIN")
  ) {
    return Errors.forbidden()
  }

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get("status")
  const employeeIdFilter = searchParams.get("employeeId")

  const where = {
    ...(statusParam && (STATUS_FILTER as readonly string[]).includes(statusParam)
      ? { status: statusParam as StatusFilter }
      : {}),
    ...(employeeIdFilter ? { employeeId: employeeIdFilter } : {}),
  }

  const sessions = await prisma.faceEnrollmentSession.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      employee: { select: { id: true, fullName: true, nip: true } },
    },
  })

  return NextResponse.json({
    data: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      employee: s.employee,
      adminId: s.adminId,
      tokenExpiresAt: s.tokenExpiresAt.toISOString(),
      submittedAt: s.submittedAt?.toISOString() ?? null,
      approvedAt: s.approvedAt?.toISOString() ?? null,
      approvedBy: s.approvedBy,
      rejectedAt: s.rejectedAt?.toISOString() ?? null,
      rejectedBy: s.rejectedBy,
      rejectReason: s.rejectReason,
      hasThumbnail: !!s.thumbnailUrl,
      embeddingModelVersion: s.embeddingModelVersion,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (
    !session.user.roles.includes("ADMIN_KEPEGAWAIAN") &&
    !session.user.roles.includes("SUPERADMIN")
  ) {
    return Errors.forbidden()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation("employeeId diperlukan")

  const { employeeId } = parsed.data

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, isActive: true },
  })
  if (!employee) return Errors.notFound("Pegawai")
  if (!employee.isActive) return Errors.validation("Pegawai non-aktif tidak bisa di-enroll")

  // Invalidate sesi PENDING lama untuk pegawai ini — cegah token menumpuk.
  await prisma.faceEnrollmentSession.updateMany({
    where: { employeeId, status: "PENDING" },
    data: { status: "EXPIRED" },
  })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + FACE_ENROLLMENT.TOKEN_TTL_MINUTES * 60_000)
  const token = generateEnrollmentToken()

  const created = await prisma.faceEnrollmentSession.create({
    data: {
      employeeId,
      adminId: session.user.id,
      token,
      tokenExpiresAt: expiresAt,
      status: "PENDING",
    },
  })

  await writeAuditLog({
    actorId: session.user.id,
    action: "FACE_ENROLLMENT_SESSION_CREATED",
    entityType: "FaceEnrollmentSession",
    entityId: created.id,
    metadata: { employeeId, expiresAt: expiresAt.toISOString() },
  })

  return NextResponse.json({
    id: created.id,
    employeeId,
    employeeName: employee.fullName,
    token,
    // Payload yang di-encode ke QR di admin panel. Prefix `cs-enroll:` biar
    // mobile app bisa membedakan dari QR absensi (yang formatnya `deviceId|counter|hmac`).
    qrPayload: `cs-enroll:${token}`,
    tokenExpiresAt: expiresAt.toISOString(),
    ttlSeconds: FACE_ENROLLMENT.TOKEN_TTL_MINUTES * 60,
  })
}
