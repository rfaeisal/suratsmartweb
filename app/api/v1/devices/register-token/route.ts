import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const registerSchema = z.object({
  fcmToken: z.string().min(1),
  deviceId: z.string().min(1),
})

const deleteSchema = z.object({
  deviceId: z.string().min(1),
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

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("fcmToken dan deviceId diperlukan")
  }

  const { fcmToken, deviceId } = parsed.data

  await prisma.fcmToken.upsert({
    where: { deviceId },
    create: { userId: user.userId, deviceId, token: fcmToken },
    update: { token: fcmToken, userId: user.userId },
  })

  return NextResponse.json({ message: "Token registered" })
}

export async function DELETE(req: NextRequest) {
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

  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("deviceId diperlukan")
  }

  await prisma.fcmToken.deleteMany({
    where: { deviceId: parsed.data.deviceId, userId: user.userId },
  })

  return NextResponse.json({ message: "Token removed" })
}
