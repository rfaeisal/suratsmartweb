import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

/**
 * Polling endpoint untuk mobile app — cek status enrollment wajah pegawai
 * yang sedang login. Ringan (1-2 query), aman dipanggil setiap detik saat
 * user berada di halaman "Enroll Wajah".
 *
 * Response contoh (belum enroll, tidak ada sesi):
 * {
 *   "hasEnrollment": false,
 *   "enrolledAt": null,
 *   "modelVersion": null,
 *   "activeSession": null
 * }
 *
 * Response contoh (sudah submit, menunggu approval admin):
 * {
 *   "hasEnrollment": false,
 *   "enrolledAt": null,
 *   "modelVersion": null,
 *   "activeSession": {
 *     "id": "cuid",
 *     "status": "SUBMITTED",
 *     "createdAt": "…",
 *     "tokenExpiresAt": "…",
 *     "submittedAt": "…",
 *     "rejectReason": null
 *   }
 * }
 *
 * Response contoh (sudah enrolled + approved, tanpa sesi baru):
 * {
 *   "hasEnrollment": true,
 *   "enrolledAt": "2026-08-18T05:32:00.000Z",
 *   "modelVersion": "mobilefacenet-sirius-v1",
 *   "activeSession": null
 * }
 */
export async function GET(req: NextRequest) {
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

  const employeeId = authUser.employeeId

  const [employee, activeSession] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        faceEnrolledAt: true,
        faceEmbeddingModelVersion: true,
      },
    }),
    // Sesi paling baru yang PENDING / SUBMITTED / (REJECTED belum di-follow-up).
    // Kalau APPROVED → tidak dianggap "active" (data sudah ada di Employee).
    prisma.faceEnrollmentSession.findFirst({
      where: {
        employeeId,
        status: { in: ["PENDING", "SUBMITTED", "REJECTED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        tokenExpiresAt: true,
        submittedAt: true,
        rejectedAt: true,
        rejectReason: true,
      },
    }),
  ])

  const hasEnrollment = !!employee?.faceEnrolledAt

  // Kalau sesi REJECTED sudah lama (>7 hari) & sudah ada enrollment approved
  // sebelumnya, tidak perlu di-expose lagi ke UI.
  let shownSession: typeof activeSession = activeSession
  if (
    shownSession?.status === "REJECTED" &&
    hasEnrollment &&
    shownSession.rejectedAt &&
    Date.now() - shownSession.rejectedAt.getTime() > 7 * 24 * 60 * 60 * 1000
  ) {
    shownSession = null
  }

  return NextResponse.json({
    hasEnrollment,
    enrolledAt: employee?.faceEnrolledAt?.toISOString() ?? null,
    modelVersion: employee?.faceEmbeddingModelVersion ?? null,
    activeSession: shownSession
      ? {
          id: shownSession.id,
          status: shownSession.status,
          createdAt: shownSession.createdAt.toISOString(),
          tokenExpiresAt: shownSession.tokenExpiresAt.toISOString(),
          submittedAt: shownSession.submittedAt?.toISOString() ?? null,
          rejectedAt: shownSession.rejectedAt?.toISOString() ?? null,
          rejectReason: shownSession.rejectReason,
        }
      : null,
  })
}
