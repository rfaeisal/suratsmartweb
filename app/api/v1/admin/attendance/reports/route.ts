import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { buildAttendanceExcel } from "@/lib/reports/attendance-excel"
import { buildAttendancePdf } from "@/lib/reports/attendance-pdf"
import type { AttendanceRow } from "@/lib/reports/attendance-types"

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  work_unit_id: z.string().optional(),
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

  const { from, to, format } = parsed.data
  let { work_unit_id } = parsed.data

  const isAdmin =
    auth.roles.includes("ADMIN_KEPEGAWAIAN") || auth.roles.includes("SUPERADMIN")
  const isUnitRole =
    auth.roles.includes("KEPALA_UNIT") || auth.roles.includes("ADMIN_UNIT")

  // Unit roles hanya bisa lihat unitnya sendiri
  if (isUnitRole && !isAdmin) {
    work_unit_id = auth.managedWorkUnitId ?? "__none__"
  }

  const fromDate = new Date(from + "T00:00:00.000Z")
  const toDate = new Date(to + "T00:00:00.000Z")

  const rosters = await prisma.roster.findMany({
    where: {
      tanggalKerja: { gte: fromDate, lte: toDate },
      ...(work_unit_id ? { workUnitId: work_unit_id } : {}),
    },
    include: {
      employee: { select: { nip: true, fullName: true, unit: { select: { name: true } } } },
      shift: { select: { nama: true } },
      alphaRecord: { select: { id: true } },
    },
    orderBy: [{ tanggalKerja: "asc" }, { employeeId: "asc" }],
  })

  const attendances = await prisma.attendance.findMany({
    where: {
      tanggalKerja: { gte: fromDate, lte: toDate },
      ...(work_unit_id ? { workUnitId: work_unit_id } : {}),
      eventType: { in: ["MASUK", "PULANG"] },
    },
    orderBy: { recordedAt: "asc" },
  })

  // Split per event_type — ambil tap MASUK pertama & PULANG pertama per (employee, tanggal).
  // Flags/telat/beacon diambil dari tap MASUK (event yang paling representatif untuk status hadir).
  interface AttSlot {
    masukAt: Date | null
    pulangAt: Date | null
    telat: boolean
    flags: string[]
    beaconDetected: boolean | null
  }
  const attMap = new Map<string, AttSlot>()
  for (const a of attendances) {
    const key = `${a.employeeId}|${a.tanggalKerja.toISOString()}`
    const slot = attMap.get(key) ?? {
      masukAt: null,
      pulangAt: null,
      telat: false,
      flags: [],
      beaconDetected: null,
    }
    if (a.eventType === "MASUK" && !slot.masukAt) {
      slot.masukAt = a.recordedAt
      slot.telat = a.telat
      slot.flags = (a.flags as string[]) ?? []
      slot.beaconDetected = a.beaconDetected
    } else if (a.eventType === "PULANG" && !slot.pulangAt) {
      slot.pulangAt = a.recordedAt
    }
    attMap.set(key, slot)
  }

  const rows: AttendanceRow[] = rosters.map((r) => {
    const key = `${r.employeeId}|${r.tanggalKerja.toISOString()}`
    const slot = attMap.get(key)
    const isAlpha = !!r.alphaRecord

    return {
      nip: r.employee.nip ?? "",
      nama: r.employee.fullName,
      unit: r.employee.unit?.name ?? "",
      tanggalKerja: r.tanggalKerja.toISOString().slice(0, 10),
      shift: r.shift?.nama ?? null,
      jamMasuk: slot?.masukAt?.toISOString() ?? null,
      jamPulang: slot?.pulangAt?.toISOString() ?? null,
      status: slot?.masukAt ? "hadir" : isAlpha ? "alpha" : "belum",
      telat: slot?.telat ?? false,
      flags: slot?.flags ?? [],
      beaconDetected: slot?.beaconDetected ?? null,
    }
  })

  const title = `Laporan Absensi ${from} s.d. ${to}`

  if (format === "xlsx") {
    const buffer = await buildAttendanceExcel(rows, title)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="absensi-${from}-${to}.xlsx"`,
      },
    })
  }

  if (format === "pdf") {
    const buffer = await buildAttendancePdf(rows, title)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="absensi-${from}-${to}.pdf"`,
      },
    })
  }

  return NextResponse.json({ title, total: rows.length, data: rows })
}
