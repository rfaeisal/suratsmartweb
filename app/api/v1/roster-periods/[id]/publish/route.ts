import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let authUser
  try {
    authUser = await requireAuth(req, ["KEPALA_UNIT", "ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const period = await prisma.rosterPeriod.findUnique({ where: { id } })
  if (!period) return Errors.notFound("Periode roster")
  if (period.status === "PUBLISHED") return Errors.conflict("Periode sudah diterbitkan")

  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")
  const isKepalaUnit = authUser.roles.includes("KEPALA_UNIT") && !isAdmin

  if (isKepalaUnit) {
    if (authUser.managedWorkUnitId !== period.workUnitId) return Errors.forbidden()
    if (period.status !== "PENDING_APPROVAL") {
      return Errors.conflict("Roster harus diajukan oleh Admin Unit terlebih dahulu sebelum dapat diterbitkan")
    }
  }

  const updated = await prisma.rosterPeriod.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date(), publishedBy: authUser.userId },
  })

  return NextResponse.json({ id: updated.id, status: updated.status, published_at: updated.publishedAt })
}
