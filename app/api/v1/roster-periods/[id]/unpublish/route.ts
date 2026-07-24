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
  if (period.status !== "PUBLISHED") return Errors.conflict("Periode belum diterbitkan")

  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")
  if (!isAdmin && authUser.roles.includes("KEPALA_UNIT")) {
    if (authUser.managedWorkUnitId !== period.workUnitId) return Errors.forbidden()
  }

  const updated = await prisma.rosterPeriod.update({
    where: { id },
    data: { status: "DRAFT", publishedAt: null, publishedBy: null },
  })

  return NextResponse.json({ id: updated.id, status: updated.status })
}
