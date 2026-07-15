import { NextRequest } from "next/server"
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/jwt"
import { prisma } from "@/lib/prisma"
import type { AppRole } from "@prisma/client"

export interface AuthUser {
  userId: string
  sessionId: string
  roles: AppRole[]
  employeeId: string
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "SESSION_REVOKED" | "FORBIDDEN",
    message: string,
  ) {
    super(message)
  }
}

export async function requireAuth(req: NextRequest, allowedRoles?: AppRole[]): Promise<AuthUser> {
  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("UNAUTHORIZED", "Token tidak disertakan")
  }

  const token = authHeader.slice(7)
  let payload: AccessTokenPayload
  try {
    payload = await verifyAccessToken(token)
  } catch {
    throw new AuthError("UNAUTHORIZED", "Token tidak valid atau sudah kadaluarsa")
  }

  const session = await prisma.userSession.findUnique({
    where: { id: payload.sessionId },
    select: { status: true },
  })

  if (!session) {
    throw new AuthError("UNAUTHORIZED", "Sesi tidak ditemukan")
  }
  if (session.status === "REVOKED") {
    throw new AuthError("SESSION_REVOKED", "Sesi telah dicabut. Silakan login ulang.")
  }

  // Update lastActiveAt secara non-blocking
  prisma.userSession
    .update({ where: { id: payload.sessionId }, data: { lastActiveAt: new Date() } })
    .catch(() => {})

  const user: AuthUser = {
    userId: payload.userId,
    sessionId: payload.sessionId,
    roles: payload.roles as AppRole[],
    employeeId: payload.employeeId,
  }

  if (allowedRoles && !user.roles.some((r) => allowedRoles.includes(r))) {
    throw new AuthError("FORBIDDEN", "Anda tidak memiliki akses ke resource ini")
  }

  return user
}
