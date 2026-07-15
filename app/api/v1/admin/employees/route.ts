import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    return Errors.forbidden()
  }

  const { searchParams } = new URL(req.url)
  const unitId = searchParams.get("unitId")
  const employeeType = searchParams.get("employeeType")
  const search = searchParams.get("search")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const perPage = Math.min(500, Math.max(1, parseInt(searchParams.get("perPage") ?? "25")))

  const where = {
    isActive: true,
    ...(unitId ? { unitId } : {}),
    ...(employeeType ? { employeeType: employeeType as never } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { nip: { contains: search } },
            { positionTitle: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        position: { select: { id: true, name: true, level: true } },
      },
      orderBy: [{ unit: { name: "asc" } }, { fullName: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ])

  // Resolve nama atasan dari directSupervisorId (legacyId)
  const supervisorIds = employees
    .map((e) => e.directSupervisorId)
    .filter((id): id is string => !!id)

  const supervisors = supervisorIds.length
    ? await prisma.employee.findMany({
        where: { legacyId: { in: supervisorIds } },
        select: { legacyId: true, fullName: true, positionTitle: true },
      })
    : []

  const supervisorMap = Object.fromEntries(supervisors.map((s) => [s.legacyId, s]))

  const data = employees.map((e) => ({
    ...e,
    supervisor: e.directSupervisorId ? (supervisorMap[e.directSupervisorId] ?? null) : null,
  }))

  return NextResponse.json({ data, total, page, perPage, totalPages: Math.ceil(total / perPage) })
}
