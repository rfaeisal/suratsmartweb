import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

function rosterToJson(r: {
  id: string; employeeId: string; workUnitId: string; periodId: string; shiftId: string; tanggalKerja: Date
  employee?: { nip: string; fullName: string } | null
  shift?: { nama: string; startTime: string; endTime: string; crossesMidnight: boolean } | null
}) {
  return {
    id: r.id,
    employee_id: r.employeeId,
    work_unit_id: r.workUnitId,
    period_id: r.periodId,
    shift_id: r.shiftId,
    tanggal_kerja: new Date(r.tanggalKerja).toISOString().slice(0, 10),
    employee: r.employee ? { nip: r.employee.nip, full_name: r.employee.fullName } : undefined,
    shift: r.shift
      ? { nama: r.shift.nama, start_time: r.shift.startTime, end_time: r.shift.endTime, crosses_midnight: r.shift.crossesMidnight }
      : undefined,
  }
}

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

  const periodId = new URL(req.url).searchParams.get("period_id")
  if (!periodId) return Errors.validation("period_id wajib diisi")

  const period = await prisma.rosterPeriod.findUnique({ where: { id: periodId } })
  if (!period) return Errors.notFound("Periode roster")

  const isUnitRole =
    authUser.roles.includes("KEPALA_UNIT") || authUser.roles.includes("ADMIN_UNIT")
  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")

  if (isUnitRole && !isAdmin && authUser.managedWorkUnitId !== period.workUnitId) {
    return Errors.forbidden()
  }

  const rosters = await prisma.roster.findMany({
    where: { periodId },
    include: {
      employee: { select: { nip: true, fullName: true } },
      shift: { select: { nama: true, startTime: true, endTime: true, crossesMidnight: true } },
    },
    orderBy: [{ tanggalKerja: "asc" }, { employee: { fullName: "asc" } }],
  })

  return NextResponse.json({ data: rosters.map(rosterToJson) })
}

const createSchema = z.object({
  employee_id: z.string().min(1),
  period_id: z.string().min(1),
  shift_id: z.string().min(1),
  tanggal_kerja: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

  const { employee_id, period_id, shift_id, tanggal_kerja } = parsed.data

  const period = await prisma.rosterPeriod.findUnique({ where: { id: period_id } })
  if (!period) return Errors.notFound("Periode roster")
  if (period.status === "PUBLISHED") return Errors.conflict("Periode sudah diterbitkan, tidak bisa diubah")

  const isUnitRole =
    authUser.roles.includes("KEPALA_UNIT") || authUser.roles.includes("ADMIN_UNIT")
  const isAdmin =
    authUser.roles.includes("ADMIN_KEPEGAWAIAN") || authUser.roles.includes("SUPERADMIN")

  if (isUnitRole && !isAdmin && authUser.managedWorkUnitId !== period.workUnitId) {
    return Errors.forbidden()
  }

  // ADMIN_UNIT tidak bisa edit setelah submit
  if (
    authUser.roles.includes("ADMIN_UNIT") &&
    !isAdmin &&
    !authUser.roles.includes("KEPALA_UNIT") &&
    period.status === "PENDING_APPROVAL"
  ) {
    return Errors.conflict("Roster sudah diajukan untuk persetujuan. Minta Kepala Unit untuk mengembalikannya jika perlu diubah.")
  }

  const tanggalKerja = new Date(tanggal_kerja + "T00:00:00.000Z")
  const existing = await prisma.roster.findUnique({
    where: { employeeId_tanggalKerja: { employeeId: employee_id, tanggalKerja } },
  })
  if (existing) return Errors.conflict("Pegawai sudah punya jadwal pada tanggal ini")

  const roster = await prisma.roster.create({
    data: { employeeId: employee_id, workUnitId: period.workUnitId, periodId: period_id, shiftId: shift_id, tanggalKerja },
    include: {
      employee: { select: { nip: true, fullName: true } },
      shift: { select: { nama: true, startTime: true, endTime: true, crossesMidnight: true } },
    },
  })

  return NextResponse.json(rosterToJson(roster), { status: 201 })
}
