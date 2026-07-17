import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const schema = z.object({
  token: z.string().min(1),
})

// Legacy endpoint — gunakan POST /api/v1/devices/register-token untuk client baru
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Token FCM diperlukan")
  }

  // Ambil deviceId dari session aktif user
  const session = user.sessionId !== "web"
    ? await prisma.userSession.findUnique({
        where: { id: user.sessionId },
        select: { deviceId: true },
      })
    : null

  const deviceId = session?.deviceId ?? null

  if (deviceId) {
    await prisma.fcmToken.upsert({
      where: { deviceId },
      create: { userId: user.userId, deviceId, token: parsed.data.token },
      update: { token: parsed.data.token, userId: user.userId },
    })
  } else {
    // Fallback: simpan tanpa deviceId (web session atau deviceId tidak tersedia)
    await prisma.fcmToken.create({
      data: { userId: user.userId, token: parsed.data.token },
    })
  }

  return NextResponse.json({ success: true })
}
