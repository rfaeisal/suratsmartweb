import { NextRequest } from "next/server"
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/jwt"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import type { AppRole } from "@prisma/client"

export interface AuthUser {
  userId: string
  sessionId: string
  roles: AppRole[]
  employeeId: string
  managedWorkUnitId: string | null
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "SESSION_REVOKED" | "FORBIDDEN",
    message: string,
  ) {
    super(message)
  }
}

async function deriveRolesAndUnit(
  userId: string,
  employeeId: string,
  storedRoles: AppRole[],
): Promise<{ roles: AppRole[]; managedWorkUnitId: string | null }> {
  let roles = [...storedRoles]
  let managedWorkUnitId: string | null = null

  // KEPALA_UNIT and ADMIN_UNIT are derived from WorkUnit master, not manually assigned
  const [kepalaUnit, adminUnit] = await Promise.all([
    prisma.workUnit.findFirst({ where: { kepalaRuanganId: employeeId }, select: { id: true } }),
    prisma.workUnit.findFirst({ where: { adminUnitId: employeeId }, select: { id: true } }),
  ])

  if (kepalaUnit) {
    if (!roles.includes("KEPALA_UNIT")) roles.push("KEPALA_UNIT")
    managedWorkUnitId = kepalaUnit.id
  }
  if (adminUnit && !managedWorkUnitId) {
    if (!roles.includes("ADMIN_UNIT")) roles.push("ADMIN_UNIT")
    managedWorkUnitId = adminUnit.id
  }

  return { roles: roles as AppRole[], managedWorkUnitId }
}

export async function requireAuth(req: NextRequest, allowedRoles?: AppRole[]): Promise<AuthUser> {
  const authHeader = req.headers.get("authorization")

  // Path 1: Bearer token (mobile app)
  if (authHeader?.startsWith("Bearer ")) {
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

    if (!session) throw new AuthError("UNAUTHORIZED", "Sesi tidak ditemukan")
    if (session.status === "REVOKED") {
      throw new AuthError("SESSION_REVOKED", "Sesi telah dicabut. Silakan login ulang.")
    }

    prisma.userSession
      .update({ where: { id: payload.sessionId }, data: { lastActiveAt: new Date() } })
      .catch(() => {})

    const { roles, managedWorkUnitId } = await deriveRolesAndUnit(
      payload.userId,
      payload.employeeId,
      payload.roles as AppRole[],
    )

    const user: AuthUser = {
      userId: payload.userId,
      sessionId: payload.sessionId,
      roles,
      employeeId: payload.employeeId,
      managedWorkUnitId,
    }

    if (allowedRoles && !user.roles.some((r) => allowedRoles.includes(r))) {
      throw new AuthError("FORBIDDEN", "Anda tidak memiliki akses ke resource ini")
    }

    return user
  }

  // Path 2: NextAuth session cookie (web browser)
  const session = await auth()
  if (session?.user?.id && session.user.employeeId) {
    const { roles, managedWorkUnitId } = await deriveRolesAndUnit(
      session.user.id,
      session.user.employeeId,
      session.user.roles ?? ["PEGAWAI"],
    )

    const user: AuthUser = {
      userId: session.user.id,
      sessionId: "web",
      roles,
      employeeId: session.user.employeeId,
      managedWorkUnitId,
    }

    if (allowedRoles && !user.roles.some((r) => allowedRoles.includes(r))) {
      throw new AuthError("FORBIDDEN", "Anda tidak memiliki akses ke resource ini")
    }

    return user
  }

  throw new AuthError("UNAUTHORIZED", "Token tidak disertakan")
}
