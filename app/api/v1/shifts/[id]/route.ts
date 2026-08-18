import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

const timeOrNull = z.string().regex(/^\d{2}:\d{2}$/).nullable()

const patchSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  crosses_midnight: z.boolean().optional(),
  type: z.enum(["ROTASI", "TETAP"]).optional(),
  work_days: z.array(z.number().int().min(1).max(7)).optional(),
  active: z.boolean().optional(),
  check_in_window_start: timeOrNull.optional(),
  check_in_window_end: timeOrNull.optional(),
  check_out_window_start: timeOrNull.optional(),
  check_out_window_end: timeOrNull.optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return Errors.notFound("Shift")

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const updated = await prisma.shift.update({
    where: { id },
    data: {
      ...(parsed.data.nama !== undefined && { nama: parsed.data.nama }),
      ...(parsed.data.start_time !== undefined && { startTime: parsed.data.start_time }),
      ...(parsed.data.end_time !== undefined && { endTime: parsed.data.end_time }),
      ...(parsed.data.crosses_midnight !== undefined && { crossesMidnight: parsed.data.crosses_midnight }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.work_days !== undefined && { workDays: parsed.data.work_days }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      ...(parsed.data.check_in_window_start !== undefined && { checkInWindowStart: parsed.data.check_in_window_start }),
      ...(parsed.data.check_in_window_end !== undefined && { checkInWindowEnd: parsed.data.check_in_window_end }),
      ...(parsed.data.check_out_window_start !== undefined && { checkOutWindowStart: parsed.data.check_out_window_start }),
      ...(parsed.data.check_out_window_end !== undefined && { checkOutWindowEnd: parsed.data.check_out_window_end }),
    },
  })

  return NextResponse.json({
    id: updated.id,
    nama: updated.nama,
    start_time: updated.startTime,
    end_time: updated.endTime,
    crosses_midnight: updated.crossesMidnight,
    type: updated.type,
    work_days: updated.workDays,
    active: updated.active,
    check_in_window_start: updated.checkInWindowStart,
    check_in_window_end: updated.checkInWindowEnd,
    check_out_window_start: updated.checkOutWindowStart,
    check_out_window_end: updated.checkOutWindowEnd,
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const shift = await prisma.shift.findUnique({ where: { id } })
  if (!shift) return Errors.notFound("Shift")

  const inUse = await prisma.roster.findFirst({ where: { shiftId: id } })
  if (inUse) return Errors.conflict("Shift sedang dipakai di roster dan tidak bisa dihapus. Nonaktifkan saja.")

  await prisma.shift.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
