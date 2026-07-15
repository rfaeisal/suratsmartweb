import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

type RouteParams = { params: Promise<{ userId: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "FORBIDDEN") return Errors.forbidden()
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { userId } = await params

  const appUser = await prisma.appUser.findUnique({
    where: { id: userId },
    include: { employee: { select: { nip: true, fullName: true } } },
  })
  if (!appUser) return Errors.notFound("User")

  const sessions = await prisma.userSession.findMany({
    where: { userId },
    select: {
      id: true,
      deviceId: true,
      deviceLabel: true,
      status: true,
      createdAt: true,
      lastActiveAt: true,
      revokedAt: true,
      revokedBy: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    user: {
      id: appUser.id,
      nip: appUser.employee.nip,
      fullName: appUser.employee.fullName,
    },
    sessions,
  })
}
