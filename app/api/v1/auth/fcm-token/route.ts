import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const schema = z.object({
  token: z.string().min(1),
})

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

  await prisma.fcmToken.upsert({
    where: { token: parsed.data.token },
    create: { userId: user.userId, token: parsed.data.token, platform: "android" },
    update: { userId: user.userId },
  })

  return NextResponse.json({ success: true })
}
