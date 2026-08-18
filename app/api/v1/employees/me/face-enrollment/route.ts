import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"
import { writeAuditLog } from "@/lib/audit"
import { FACE_ENROLLMENT, packEmbedding } from "@/lib/face-embedding"
import { saveFaceThumbnail } from "@/lib/face-storage"

const bodySchema = z.object({
  token: z.string().min(FACE_ENROLLMENT.TOKEN_LENGTH).max(FACE_ENROLLMENT.TOKEN_LENGTH),
  embedding: z
    .array(z.number().finite())
    .min(FACE_ENROLLMENT.EMBEDDING_MIN_DIM)
    .max(FACE_ENROLLMENT.EMBEDDING_MAX_DIM),
  embeddingModelVersion: z.string().min(1).max(64),
  // Thumbnail base64-encoded JPEG (tanpa prefix data:).
  thumbnailBase64: z.string().min(100).max(120_000),
  deviceInfo: z
    .object({
      model: z.string().optional(),
      os: z.string().optional(),
      cameraResolution: z.string().optional(),
    })
    .optional(),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  if (!rateLimit(`face-enroll:${ip}`, 5, 60_000)) return Errors.tooManyRequests()

  let authUser
  try {
    authUser = await requireAuth(req, ["PEGAWAI"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation(parsed.error.issues[0]?.message ?? "Payload tidak valid")
  }

  const { token, embedding, embeddingModelVersion, thumbnailBase64, deviceInfo } = parsed.data

  // Decode thumbnail
  let thumbnailBuf: Buffer
  try {
    thumbnailBuf = Buffer.from(thumbnailBase64, "base64")
  } catch {
    return Errors.validation("Thumbnail base64 tidak valid")
  }
  if (thumbnailBuf.byteLength === 0) {
    return Errors.validation("Thumbnail kosong")
  }

  const enrollment = await prisma.faceEnrollmentSession.findUnique({
    where: { token },
    select: {
      id: true,
      employeeId: true,
      status: true,
      tokenExpiresAt: true,
    },
  })
  if (!enrollment) return Errors.notFound("Sesi enrollment")
  if (enrollment.employeeId !== authUser.employeeId) {
    return Errors.forbidden("Sesi enrollment bukan milik pegawai ini")
  }
  if (enrollment.status !== "PENDING") {
    return Errors.validation(`Sesi sudah ${enrollment.status.toLowerCase()}`)
  }
  if (enrollment.tokenExpiresAt < new Date()) {
    await prisma.faceEnrollmentSession.update({
      where: { id: enrollment.id },
      data: { status: "EXPIRED" },
    })
    return Errors.validation("Sesi enrollment kedaluwarsa. Minta admin generate ulang.")
  }

  // Simpan thumbnail — path final ditulis ke session. Baru dipindah ke Employee
  // saat admin approve.
  let thumbnailUrl: string
  try {
    thumbnailUrl = await saveFaceThumbnail(`session-${enrollment.id}`, thumbnailBuf)
  } catch (err) {
    return Errors.validation(err instanceof Error ? err.message : "Gagal simpan thumbnail")
  }

  const packedEmbedding = packEmbedding(embedding)
  // Prisma Bytes expects Uint8Array<ArrayBuffer>; Buffer's backing type is
  // ArrayBufferLike (bisa SharedArrayBuffer) — copy ke ArrayBuffer baru.
  const embeddingBytes = new Uint8Array(new ArrayBuffer(packedEmbedding.byteLength))
  embeddingBytes.set(packedEmbedding)

  await prisma.faceEnrollmentSession.update({
    where: { id: enrollment.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      embedding: embeddingBytes,
      embeddingModelVersion,
      thumbnailUrl,
      deviceInfo: deviceInfo ?? undefined,
    },
  })

  await writeAuditLog({
    actorId: authUser.userId,
    action: "FACE_ENROLLMENT_SUBMITTED",
    entityType: "FaceEnrollmentSession",
    entityId: enrollment.id,
    metadata: {
      employeeId: enrollment.employeeId,
      embeddingDim: embedding.length,
      embeddingModelVersion,
      thumbnailBytes: thumbnailBuf.byteLength,
      ip,
    },
  })

  return NextResponse.json({
    id: enrollment.id,
    status: "SUBMITTED",
    message: "Enrollment dikirim. Menunggu persetujuan admin.",
  })
}
