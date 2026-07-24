import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const workUnitId = searchParams.get("work_unit_id")
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : undefined

  const isUnitRole =
    authUser.roles.includes("KEPALA_UNIT") || authUser.roles.includes("ADMIN_UNIT")
  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")

  const effectiveWorkUnitId =
    isUnitRole && !isAdmin
      ? (authUser.managedWorkUnitId ?? "__none__")
      : workUnitId

  const periods = await prisma.rosterPeriod.findMany({
    where: {
      ...(effectiveWorkUnitId ? { workUnitId: effectiveWorkUnitId } : {}),
      ...(year ? { year } : {}),
      ...(month ? { month } : {}),
    },
    include: { workUnit: { select: { id: true, name: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })

  return NextResponse.json({
    data: periods.map((p) => ({
      id: p.id,
      work_unit_id: p.workUnitId,
      work_unit_name: p.workUnit.name,
      year: p.year,
      month: p.month,
      status: p.status,
      published_at: p.publishedAt,
    })),
  })
}

const createSchema = z.object({
  work_unit_id: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
})

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const { work_unit_id, year, month } = parsed.data

  const isUnitRole =
    authUser.roles.includes("KEPALA_UNIT") || authUser.roles.includes("ADMIN_UNIT")
  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")

  if (isUnitRole && !isAdmin && authUser.managedWorkUnitId !== work_unit_id) {
    return Errors.forbidden()
  }

  const workUnit = await prisma.workUnit.findUnique({ where: { id: work_unit_id } })
  if (!workUnit) return Errors.notFound("Unit kerja")

  const existing = await prisma.rosterPeriod.findUnique({
    where: { workUnitId_year_month: { workUnitId: work_unit_id, year, month } },
  })
  if (existing) return Errors.conflict("Periode roster sudah ada untuk unit dan bulan ini")

  const period = await prisma.rosterPeriod.create({ data: { workUnitId: work_unit_id, year, month } })
  return NextResponse.json(
    { id: period.id, work_unit_id: period.workUnitId, year, month, status: period.status },
    { status: 201 },
  )
}
