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

  await prisma.userSession.update({
    where: { id: user.sessionId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedBy: "SELF" },
  })

  // Hapus FCM token yang terkait (opsional: perlu deviceId untuk hapus spesifik)
  // Untuk sekarang hapus semua token FCM milik user ini di session yang di-revoke
  // TODO: filter berdasarkan deviceId ketika FCM token menyimpan deviceId

  await writeAuditLog({
    actorId: user.userId,
    action: "LOGOUT",
    entityType: "UserSession",
    entityId: user.sessionId,
  })

  return NextResponse.json({ success: true })
}
