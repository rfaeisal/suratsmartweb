import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { buildMonthlyRecapExcel } from "@/lib/reports/monthly-recap-excel"
import { buildMonthlyRecapPdf } from "@/lib/reports/monthly-recap-pdf"
import type { MonthlyRecapRow, MonthlyRecapSummary } from "@/lib/reports/monthly-recap-types"

// Menerima either (year+month) atau (from+to). Kalau from+to di-supply,
// itu prioritas. Client bulanan tetap kirim year+month untuk backward compat +
// title yang bagus; client rentang kirim from+to.
const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  work_unit_id: z.string().optional(),
  format: z.enum(["json", "xlsx", "pdf"]).default("json"),
}).refine(
  (v) => (v.year !== undefined && v.month !== undefined) || (v.from !== undefined && v.to !== undefined),
  { message: "Wajib isi (year+month) atau (from+to)" },
)

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

export async function GET(req: NextRequest) {
  let auth
  try {
    auth = await requireAuth(req, ["ADMIN_UNIT", "KEPALA_UNIT", "ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const raw = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const { year, month, from, to, format } = parsed.data
  let { work_unit_id } = parsed.data

  const isAdmin =
    auth.roles.includes("ADMIN_KEPEGAWAIAN") || auth.roles.includes("SUPERADMIN")
  const isUnitRole =
    auth.roles.includes("KEPALA_UNIT") || auth.roles.includes("ADMIN_UNIT")

  if (isUnitRole && !isAdmin) {
    work_unit_id = auth.managedWorkUnitId ?? "__none__"
  }

  // Prioritas: from/to > year/month
  let fromDate: Date
  let toDate: Date
  if (from && to) {
    fromDate = new Date(from + "T00:00:00.000Z")
    toDate = new Date(to + "T23:59:59.999Z")
  } else {
    // Bulan penuh — awal bulan sampai awal bulan berikutnya (exclusive).
    fromDate = new Date(Date.UTC(year!, month! - 1, 1))
    toDate = new Date(Date.UTC(year!, month!, 1))
  }

  const [rosters, attendances] = await Promise.all([
    prisma.roster.findMany({
      where: {
        tanggalKerja: { gte: fromDate, lt: toDate },
        ...(work_unit_id ? { workUnitId: work_unit_id } : {}),
      },
      select: {
        employeeId: true,
        tanggalKerja: true,
        employee: { select: { nip: true, fullName: true, unit: { select: { name: true } } } },
      },
    }),
    prisma.attendance.findMany({
      where: {
        tanggalKerja: { gte: fromDate, lt: toDate },
        ...(work_unit_id ? { workUnitId: work_unit_id } : {}),
        eventType: { in: ["MASUK", "PULANG"] },
        status: "VALID",
      },
      select: { employeeId: true, tanggalKerja: true, eventType: true, telat: true },
    }),
  ])

  // Kumpulkan set (employeeId, tanggalKerja) yang punya minimal 1 tap +
  // set yang punya tap MASUK telat, biar aggregasi per pegawai tinggal cek Set.
  const hadirSet = new Set<string>()
  const telatSet = new Set<string>()
  for (const a of attendances) {
    const key = `${a.employeeId}|${a.tanggalKerja.toISOString()}`
    hadirSet.add(key)
    if (a.eventType === "MASUK" && a.telat) telatSet.add(key)
  }

  interface Agg {
    nip: string
    nama: string
    unit: string
    hariKerja: number
    hadir: number
    telat: number
  }
  const empMap = new Map<string, Agg>()
  for (const r of rosters) {
    let agg = empMap.get(r.employeeId)
    if (!agg) {
      agg = {
        nip: r.employee.nip ?? "",
        nama: r.employee.fullName,
        unit: r.employee.unit?.name ?? "",
        hariKerja: 0,
        hadir: 0,
        telat: 0,
      }
      empMap.set(r.employeeId, agg)
    }
    agg.hariKerja++
    const key = `${r.employeeId}|${r.tanggalKerja.toISOString()}`
    if (hadirSet.has(key)) agg.hadir++
    if (telatSet.has(key)) agg.telat++
  }

  const rows: MonthlyRecapRow[] = Array.from(empMap.values())
    .map((a) => ({
      ...a,
      persentase: a.hariKerja > 0 ? Math.round((a.hadir / a.hariKerja) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama))

  const summary: MonthlyRecapSummary = {
    totalPegawai: rows.length,
    totalHariKerja: rows.reduce((s, r) => s + r.hariKerja, 0),
    totalHadir: rows.reduce((s, r) => s + r.hadir, 0),
    totalTelat: rows.reduce((s, r) => s + r.telat, 0),
    rataPersentase:
      rows.length > 0
        ? Math.round((rows.reduce((s, r) => s + r.persentase, 0) / rows.length) * 10) / 10
        : 0,
  }

  const title =
    from && to
      ? `Rekap Absensi ${from} s.d. ${to}`
      : `Rekap Absensi Bulanan — ${MONTH_ID[month! - 1]} ${year}`

  if (format === "xlsx") {
    const buffer = await buildMonthlyRecapExcel(rows, summary, title)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rekap-bulanan-${from ?? `${year}-${String(month).padStart(2, "0")}`}${to ? `-${to}` : ""}.xlsx"`,
      },
    })
  }

  if (format === "pdf") {
    const buffer = await buildMonthlyRecapPdf(rows, summary, title)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rekap-bulanan-${from ?? `${year}-${String(month).padStart(2, "0")}`}${to ? `-${to}` : ""}.pdf"`,
      },
    })
  }

  return NextResponse.json({ title, summary, total: rows.length, data: rows })
}
