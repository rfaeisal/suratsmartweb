import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let authUser
  try {
    authUser = await requireAuth(req, ["ADMIN_UNIT"])
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

  if (authUser.managedWorkUnitId !== period.workUnitId) return Errors.forbidden()
  if (period.status !== "DRAFT") {
    return Errors.conflict(
      period.status === "PENDING_APPROVAL"
        ? "Roster sudah diajukan untuk persetujuan"
        : "Roster sudah diterbitkan",
    )
  }

  const updated = await prisma.rosterPeriod.update({
    where: { id },
    data: { status: "PENDING_APPROVAL" },
  })

  return NextResponse.json({ id: updated.id, status: updated.status })
}
