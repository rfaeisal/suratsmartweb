import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { signAccessToken, hashRefreshToken, verifyRefreshTokenHash } from "@/lib/jwt"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown"
  if (!rateLimit(`refresh:${ip}`, 30, 60_000)) {
    return Errors.tooManyRequests()
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = refreshSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("refreshToken diperlukan")

  const { refreshToken } = parsed.data
  const hash = hashRefreshToken(refreshToken)

  const session = await prisma.userSession.findUnique({
    where: { refreshTokenHash: hash },
    include: { user: { include: { employee: true } } },
  })

  if (!session || !verifyRefreshTokenHash(refreshToken, session.refreshTokenHash)) {
    return Errors.sessionRevoked()
  }
  if (session.status === "REVOKED") {
    return Errors.sessionRevoked()
  }

  const accessToken = await signAccessToken({
    userId: session.userId,
    sessionId: session.id,
    roles: session.user.roles,
    employeeId: session.user.employee.id,
  })

  prisma.userSession
    .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
    .catch(() => {})

  return NextResponse.json({ accessToken })
}
