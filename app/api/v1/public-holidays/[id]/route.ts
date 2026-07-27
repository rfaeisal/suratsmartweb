import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

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
  const holiday = await prisma.publicHoliday.findUnique({ where: { id } })
  if (!holiday) return Errors.notFound("Hari libur")

  await prisma.publicHoliday.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nama: z.string().min(1).max(100).optional(),
  jenis: z.enum(["NASIONAL", "CUTI_BERSAMA"]).optional(),
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
  const holiday = await prisma.publicHoliday.findUnique({ where: { id } })
  if (!holiday) return Errors.notFound("Hari libur")

  const body = await req.json().catch(() => ({}))
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const data: { date?: Date; nama?: string; jenis?: "NASIONAL" | "CUTI_BERSAMA" } = {}
  if (parsed.data.date) {
    const newDate = new Date(parsed.data.date + "T00:00:00.000Z")
    if (newDate.getTime() !== holiday.date.getTime()) {
      const clash = await prisma.publicHoliday.findUnique({ where: { date: newDate } })
      if (clash) return Errors.conflict("Tanggal libur sudah ada")
      data.date = newDate
    }
  }
  if (parsed.data.nama !== undefined) data.nama = parsed.data.nama
  if (parsed.data.jenis !== undefined) data.jenis = parsed.data.jenis

  const updated = await prisma.publicHoliday.update({ where: { id }, data })
  return NextResponse.json({
    id: updated.id,
    date: updated.date.toISOString().slice(0, 10),
    nama: updated.nama,
    jenis: updated.jenis,
  })
}
