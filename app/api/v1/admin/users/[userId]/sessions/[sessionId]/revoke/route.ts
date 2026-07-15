import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { Errors } from "@/lib/errors"

type RouteParams = { params: Promise<{ userId: string; sessionId: string }> }

export async function POST(req: NextRequest, { params }: RouteParams) {
  let adminUser
  try {
    adminUser = await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "FORBIDDEN") return Errors.forbidden()
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { userId, sessionId } = await params

  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId },
  })
  if (!session) return Errors.notFound("Sesi login")

  if (session.status === "REVOKED") {
    return Errors.conflict("Sesi sudah dalam status REVOKED")
  }

  await prisma.userSession.update({
    where: { id: sessionId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedBy: adminUser.userId,
    },
  })

  await writeAuditLog({
    actorId: adminUser.userId,
    action: "FORCE_REVOKE_SESSION",
    entityType: "UserSession",
    entityId: sessionId,
    metadata: { targetUserId: userId },
  })

  return NextResponse.json({ success: true })
}
