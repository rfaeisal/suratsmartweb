import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import type {
  OvertimeDetailRow,
  OvertimeReportSummary,
  OvertimeSummaryRow,
} from "@/lib/reports/overtime-types"
import { buildOvertimeDetailExcel } from "@/lib/reports/overtime-detail-excel"
import { buildOvertimeDetailPdf } from "@/lib/reports/overtime-detail-pdf"
import { buildOvertimeSummaryExcel } from "@/lib/reports/overtime-summary-excel"
import { buildOvertimeSummaryPdf } from "@/lib/reports/overtime-summary-pdf"

const querySchema = z.object({
  view: z.enum(["detail", "summary"]).default("detail"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  work_unit_id: z.string().optional(),
  status: z.enum(["DIAJUKAN", "DISETUJUI_UNIT", "SAH", "DITOLAK"]).optional(),
  format: z.enum(["json", "xlsx", "pdf"]).default("json"),
})

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

  const { view, from, to, status, format } = parsed.data
  let { work_unit_id } = parsed.data

  const isAdmin =
    auth.roles.includes("ADMIN_KEPEGAWAIAN") || auth.roles.includes("SUPERADMIN")
  const isUnitRole =
    auth.roles.includes("KEPALA_UNIT") || auth.roles.includes("ADMIN_UNIT")

  if (isUnitRole && !isAdmin) {
    work_unit_id = auth.managedWorkUnitId ?? "__none__"
  }

  const fromDate = new Date(from + "T00:00:00.000Z")
  const toDate = new Date(to + "T23:59:59.999Z")

  const overtimes = await prisma.overtime.findMany({
    where: {
      tanggalKerja: { gte: fromDate, lte: toDate },
      ...(work_unit_id ? { workUnitId: work_unit_id } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      employee: { select: { nip: true, fullName: true, unit: { select: { name: true } } } },
      workUnit: { select: { name: true } },
    },
    orderBy: [{ tanggalKerja: "desc" }, { createdAt: "desc" }],
  })

  // Ambil tap absen lembur untuk semua pegawai & tanggal yang ada di overtime,
  // lalu ambil paling awal MASUK + paling akhir PULANG per (employee, tanggal).
  const employeeIds = [...new Set(overtimes.map((o) => o.employeeId))]
  const attendances =
    employeeIds.length > 0
      ? await prisma.attendance.findMany({
          where: {
            employeeId: { in: employeeIds },
            tanggalKerja: { gte: fromDate, lte: toDate },
            eventType: { in: ["LEMBUR_MASUK", "LEMBUR_PULANG"] },
            status: "VALID",
          },
          select: { employeeId: true, tanggalKerja: true, eventType: true, recordedAt: true },
        })
      : []

  interface AttSlot {
    masukAt: Date | null
    pulangAt: Date | null
  }
  const attMap = new Map<string, AttSlot>()
  for (const a of attendances) {
    const key = `${a.employeeId}|${a.tanggalKerja.toISOString()}`
    let slot = attMap.get(key)
    if (!slot) {
      slot = { masukAt: null, pulangAt: null }
      attMap.set(key, slot)
    }
    if (a.eventType === "LEMBUR_MASUK") {
      if (!slot.masukAt || a.recordedAt < slot.masukAt) slot.masukAt = a.recordedAt
    } else if (a.eventType === "LEMBUR_PULANG") {
      if (!slot.pulangAt || a.recordedAt > slot.pulangAt) slot.pulangAt = a.recordedAt
    }
  }

  const detailRows: OvertimeDetailRow[] = overtimes.map((o) => {
    const key = `${o.employeeId}|${o.tanggalKerja.toISOString()}`
    const slot = attMap.get(key)
    const masukAt = slot?.masukAt?.toISOString() ?? null
    const pulangAt = slot?.pulangAt?.toISOString() ?? null
    const durasiMenit =
      masukAt && pulangAt
        ? Math.round((new Date(pulangAt).getTime() - new Date(masukAt).getTime()) / 60_000)
        : null
    return {
      id: o.id,
      nip: o.employee.nip ?? "",
      nama: o.employee.fullName,
      unit: o.workUnit.name,
      tanggalKerja: o.tanggalKerja.toISOString().slice(0, 10),
      status: o.status,
      note: o.note,
      masukAt,
      pulangAt,
      durasiMenit: durasiMenit && durasiMenit > 0 ? durasiMenit : null,
      approvedUnitAt: o.approvedUnitAt?.toISOString() ?? null,
      approvedHrAt: o.approvedHrAt?.toISOString() ?? null,
      rejectedAt: o.rejectedAt?.toISOString() ?? null,
    }
  })

  const summary: OvertimeReportSummary = {
    totalPengajuan: detailRows.length,
    totalSah: detailRows.filter((r) => r.status === "SAH").length,
    totalDitolak: detailRows.filter((r) => r.status === "DITOLAK").length,
    totalMenunggu: detailRows.filter((r) => r.status === "DIAJUKAN" || r.status === "DISETUJUI_UNIT").length,
    totalDurasiMenit: detailRows.reduce((s, r) => s + (r.durasiMenit ?? 0), 0),
  }

  const title = `Laporan Lembur ${from} s.d. ${to}`

  // --- DETAIL VIEW ---
  if (view === "detail") {
    if (format === "xlsx") {
      const buffer = await buildOvertimeDetailExcel(detailRows, summary, title)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="lembur-detail-${from}-${to}.xlsx"`,
        },
      })
    }
    if (format === "pdf") {
      const buffer = await buildOvertimeDetailPdf(detailRows, summary, title)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="lembur-detail-${from}-${to}.pdf"`,
        },
      })
    }
    return NextResponse.json({ view, title, summary, total: detailRows.length, data: detailRows })
  }

  // --- SUMMARY VIEW ---
  interface Agg {
    nip: string
    nama: string
    unit: string
    jumlahPengajuan: number
    jumlahSah: number
    jumlahDitolak: number
    jumlahMenunggu: number
    totalDurasiMenit: number
  }
  const empMap = new Map<string, Agg>()
  for (const d of detailRows) {
    const empKey = d.nip || d.nama
    let agg = empMap.get(empKey)
    if (!agg) {
      agg = {
        nip: d.nip,
        nama: d.nama,
        unit: d.unit,
        jumlahPengajuan: 0,
        jumlahSah: 0,
        jumlahDitolak: 0,
        jumlahMenunggu: 0,
        totalDurasiMenit: 0,
      }
      empMap.set(empKey, agg)
    }
    agg.jumlahPengajuan++
    if (d.status === "SAH") agg.jumlahSah++
    else if (d.status === "DITOLAK") agg.jumlahDitolak++
    else agg.jumlahMenunggu++
    agg.totalDurasiMenit += d.durasiMenit ?? 0
  }

  const summaryRows: OvertimeSummaryRow[] = Array.from(empMap.values()).sort((a, b) =>
    a.nama.localeCompare(b.nama),
  )

  if (format === "xlsx") {
    const buffer = await buildOvertimeSummaryExcel(summaryRows, summary, title)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="lembur-ringkasan-${from}-${to}.xlsx"`,
      },
    })
  }
  if (format === "pdf") {
    const buffer = await buildOvertimeSummaryPdf(summaryRows, summary, title)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lembur-ringkasan-${from}-${to}.pdf"`,
      },
    })
  }
  return NextResponse.json({ view, title, summary, total: summaryRows.length, data: summaryRows })
}
