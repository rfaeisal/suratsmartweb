import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { Errors } from "@/lib/errors"

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireAuth(req)
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const session = await prisma.userSession.update({
    where: { id: user.sessionId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedBy: "SELF" },
  })

  await prisma.fcmToken.deleteMany({
    where: { userId: user.userId, deviceId: session.deviceId },
  })

  await writeAuditLog({
    actorId: user.userId,
    action: "LOGOUT",
    entityType: "UserSession",
    entityId: user.sessionId,
  })

  return NextResponse.json({ success: true })
}
