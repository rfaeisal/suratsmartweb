import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

const LIBUR_API = "https://libur.deno.dev/api"

type LiburEntry = { date: string; name: string; is_national_holiday: boolean }

function mapJenis(isNational: boolean): "NASIONAL" | "CUTI_BERSAMA" {
  return isNational ? "NASIONAL" : "CUTI_BERSAMA"
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const yearRaw = new URL(req.url).searchParams.get("year")
  const year = Number(yearRaw)
  if (!yearRaw || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return Errors.validation("Parameter year wajib berupa angka tahun yang valid")
  }

  let entries: LiburEntry[] = []
  try {
    const res = await fetch(`${LIBUR_API}?year=${year}`, { cache: "no-store" })
    if (!res.ok) return Errors.internal("Gagal mengambil data dari libur.deno.dev")
    entries = (await res.json()) as LiburEntry[]
  } catch {
    return Errors.internal("Tidak dapat terhubung ke libur.deno.dev")
  }

  const existing = await prisma.publicHoliday.findMany({
    where: { date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
    select: { date: true },
  })
  const existingSet = new Set(existing.map((h) => h.date.toISOString().slice(0, 10)))

  const items = entries
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !existingSet.has(e.date))
    .map((e) => ({
      date: e.date,
      nama: e.name,
      jenis: mapJenis(e.is_national_holiday),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({ year, items })
}

const importSchema = z.object({
  items: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        nama: z.string().min(1).max(200),
        jenis: z.enum(["NASIONAL", "CUTI_BERSAMA"]),
      }),
    )
    .min(1),
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
  const parsed = importSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  let inserted = 0
  let skipped = 0
  for (const item of parsed.data.items) {
    const date = new Date(item.date + "T00:00:00.000Z")
    const exists = await prisma.publicHoliday.findUnique({ where: { date } })
    if (exists) {
      skipped++
      continue
    }
    await prisma.publicHoliday.create({
      data: { date, nama: item.nama.slice(0, 100), jenis: item.jenis },
    })
    inserted++
  }

  return NextResponse.json({ inserted, skipped })
}
