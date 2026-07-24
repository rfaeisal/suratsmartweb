import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

const patchSchema = z.object({ shift_id: z.string().min(1) })

function isAdminUnitOnly(roles: string[]) {
  return (
    roles.includes("ADMIN_UNIT") &&
    !roles.includes("KEPALA_UNIT") &&
    !roles.includes("ADMIN_KEPEGAWAIAN") &&
    !roles.includes("SUPERADMIN")
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let authUser
  try {
    authUser = await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN", "KEPALA_UNIT", "ADMIN_UNIT"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const roster = await prisma.roster.findUnique({ where: { id }, include: { period: true } })
  if (!roster) return Errors.notFound("Roster")
  if (roster.period.status === "PUBLISHED") return Errors.conflict("Periode sudah diterbitkan")

  const isUnitRole =
    authUser.roles.includes("KEPALA_UNIT") || authUser.roles.includes("ADMIN_UNIT")
  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")

  if (isUnitRole && !isAdmin && authUser.managedWorkUnitId !== roster.workUnitId) {
    return Errors.forbidden()
  }

  if (isAdminUnitOnly(authUser.roles) && roster.period.status === "PENDING_APPROVAL") {
    return Errors.conflict("Roster sudah diajukan untuk persetujuan. Minta Kepala Unit untuk mengembalikannya jika perlu diubah.")
  }

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const updated = await prisma.roster.update({
    where: { id },
    data: { shiftId: parsed.data.shift_id },
  })

  return NextResponse.json({ id: updated.id, shift_id: updated.shiftId })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let authUser
  try {
    authUser = await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN", "KEPALA_UNIT", "ADMIN_UNIT"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const roster = await prisma.roster.findUnique({ where: { id }, include: { period: true } })
  if (!roster) return Errors.notFound("Roster")
  if (roster.period.status === "PUBLISHED") return Errors.conflict("Periode sudah diterbitkan, tidak bisa menghapus roster")

  const isUnitRole =
    authUser.roles.includes("KEPALA_UNIT") || authUser.roles.includes("ADMIN_UNIT")
  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")

  if (isUnitRole && !isAdmin && authUser.managedWorkUnitId !== roster.workUnitId) {
    return Errors.forbidden()
  }

  if (isAdminUnitOnly(authUser.roles) && roster.period.status === "PENDING_APPROVAL") {
    return Errors.conflict("Roster sudah diajukan untuk persetujuan. Minta Kepala Unit untuk mengembalikannya jika perlu diubah.")
  }

  await prisma.roster.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
