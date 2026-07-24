import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

const bodySchema = z.object({ period_id: z.string().min(1) })

// Hari dalam seminggu JS: 0=Minggu, 1=Senin, …, 6=Sabtu
// workDays: 1=Senin, …, 7=Minggu
function jsToWorkDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

export async function POST(req: NextRequest) {
  let authUser
  try {
    authUser = await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN", "KEPALA_UNIT"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const period = await prisma.rosterPeriod.findUnique({
    where: { id: parsed.data.period_id },
    include: { workUnit: true },
  })
  if (!period) return Errors.notFound("Periode roster")
  if (period.status === "PUBLISHED") return Errors.conflict("Periode sudah diterbitkan")
  if (authUser.roles.includes("KEPALA_UNIT") && authUser.managedWorkUnitId !== period.workUnitId) {
    return Errors.forbidden()
  }

  // TETAP shifts are universally available to all units — no ShiftUnit mapping required
  const tetapShifts = await prisma.shift.findMany({
    where: { type: "TETAP", active: true },
  })
  if (tetapShifts.length === 0) {
    return Errors.validation("Belum ada shift tetap yang aktif")
  }

  const employees = await prisma.employee.findMany({
    where: { unitId: period.workUnitId, isActive: true },
    select: { id: true },
  })
  if (employees.length === 0) {
    return Errors.validation("Tidak ada pegawai aktif di unit ini")
  }

  const startDate = new Date(Date.UTC(period.year, period.month - 1, 1))
  const endDate = new Date(Date.UTC(period.year, period.month, 0))
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    select: { date: true },
  })
  const holidaySet = new Set(holidays.map((h) => h.date.getTime()))

  let created = 0
  let skipped = 0

  for (const employee of employees) {
    for (const shift of tetapShifts) {
      for (let d = 1; d <= endDate.getUTCDate(); d++) {
        const date = new Date(Date.UTC(period.year, period.month - 1, d))
        const workDay = jsToWorkDay(date.getUTCDay())

        if (!shift.workDays.includes(workDay)) continue
        if (holidaySet.has(date.getTime())) continue

        const existing = await prisma.roster.findUnique({
          where: { employeeId_tanggalKerja: { employeeId: employee.id, tanggalKerja: date } },
        })
        if (existing) { skipped++; continue }

        await prisma.roster.create({
          data: {
            employeeId: employee.id,
            workUnitId: period.workUnitId,
            periodId: period.id,
            shiftId: shift.id,
            tanggalKerja: date,
          },
        })
        created++
      }
    }
  }

  return NextResponse.json({ created, skipped, period_id: period.id })
}
