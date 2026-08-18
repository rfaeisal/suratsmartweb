import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

function shiftToJson(s: {
  id: string; nama: string; startTime: string; endTime: string
  crossesMidnight: boolean; type: string; workDays: number[]; active: boolean
  checkInWindowStart: string | null; checkInWindowEnd: string | null
  checkOutWindowStart: string | null; checkOutWindowEnd: string | null
}) {
  return {
    id: s.id,
    nama: s.nama,
    start_time: s.startTime,
    end_time: s.endTime,
    crosses_midnight: s.crossesMidnight,
    type: s.type,
    work_days: s.workDays,
    active: s.active,
    check_in_window_start: s.checkInWindowStart,
    check_in_window_end: s.checkInWindowEnd,
    check_out_window_start: s.checkOutWindowStart,
    check_out_window_end: s.checkOutWindowEnd,
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN", "KEPALA_UNIT"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const workUnitId = new URL(req.url).searchParams.get("work_unit_id")

  const shifts = await prisma.shift.findMany({
    where: workUnitId
      ? {
          active: true,
          // TETAP shifts are universally available; ROTASI shifts require an explicit ShiftUnit mapping
          OR: [{ type: "TETAP" }, { shiftUnits: { some: { workUnitId } } }],
        }
      : undefined,
    include: { shiftUnits: { select: { workUnitId: true } } },
    orderBy: { startTime: "asc" },
  })

  return NextResponse.json({
    data: shifts.map((s) => ({
      ...shiftToJson(s),
      work_unit_ids: s.shiftUnits.map((su) => su.workUnitId),
    })),
  })
}

const timeOrNull = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable()
  .optional()

const createSchema = z.object({
  nama: z.string().min(1).max(100),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  crosses_midnight: z.boolean().default(false),
  type: z.enum(["ROTASI", "TETAP"]).default("ROTASI"),
  work_days: z.array(z.number().int().min(1).max(7)).default([]),
  check_in_window_start: timeOrNull,
  check_in_window_end: timeOrNull,
  check_out_window_start: timeOrNull,
  check_out_window_end: timeOrNull,
})

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
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

  const shift = await prisma.shift.create({
    data: {
      nama: parsed.data.nama,
      startTime: parsed.data.start_time,
      endTime: parsed.data.end_time,
      crossesMidnight: parsed.data.crosses_midnight,
      type: parsed.data.type,
      workDays: parsed.data.work_days,
      checkInWindowStart: parsed.data.check_in_window_start ?? null,
      checkInWindowEnd: parsed.data.check_in_window_end ?? null,
      checkOutWindowStart: parsed.data.check_out_window_start ?? null,
      checkOutWindowEnd: parsed.data.check_out_window_end ?? null,
    },
  })

  return NextResponse.json(shiftToJson(shift), { status: 201 })
}
