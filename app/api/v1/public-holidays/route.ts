import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

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

  const year = new URL(req.url).searchParams.get("year")
  const holidays = await prisma.publicHoliday.findMany({
    where: year ? { date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } } : undefined,
    orderBy: { date: "asc" },
  })

  return NextResponse.json({
    data: holidays.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), nama: h.nama, jenis: h.jenis })),
  })
}

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nama: z.string().min(1).max(100),
  jenis: z.enum(["NASIONAL", "CUTI_BERSAMA"]).optional(),
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

  const date = new Date(parsed.data.date + "T00:00:00.000Z")
  const existing = await prisma.publicHoliday.findUnique({ where: { date } })
  if (existing) return Errors.conflict("Tanggal libur sudah ada")

  const holiday = await prisma.publicHoliday.create({
    data: { date, nama: parsed.data.nama, jenis: parsed.data.jenis ?? "NASIONAL" },
  })
  return NextResponse.json(
    { id: holiday.id, date: holiday.date.toISOString().slice(0, 10), nama: holiday.nama, jenis: holiday.jenis },
    { status: 201 },
  )
}
