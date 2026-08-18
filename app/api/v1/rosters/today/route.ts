import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { getWibDate, hitungTanggalKerja } from "@/lib/tanggal-kerja"
import { resolveWindow } from "@/lib/attendance-window"
import { getAttendanceSettings } from "@/lib/settings"

const shiftSelect = {
  nama: true,
  startTime: true,
  endTime: true,
  crossesMidnight: true,
  checkInWindowStart: true,
  checkInWindowEnd: true,
  checkOutWindowStart: true,
  checkOutWindowEnd: true,
} as const

/**
 * GET /api/v1/rosters/today
 * Endpoint untuk mobile app: menampilkan jadwal kerja pegawai yang login
 * beserta window absen (masuk/pulang) dan status "boleh tap sekarang?".
 *
 * Query params (opsional):
 *   - employee_id: hanya admin/kepala unit yang boleh lookup pegawai lain.
 *
 * Response:
 *   {
 *     tanggal_wib: "2026-08-19",
 *     roster: {...} | null,
 *     window: { check_in: {start,end}, check_out: {start,end} } | null,
 *     can_check_in: boolean,
 *     can_check_out: boolean,
 *     overtime_status_today: "DIAJUKAN" | "DISETUJUI_UNIT" | "SAH" | "DITOLAK" | null,
 *   }
 */
export async function GET(req: NextRequest) {
  let authUser
  try {
    authUser = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const employeeIdParam = new URL(req.url).searchParams.get("employee_id")
  const isAdmin = authUser.roles.some((r) =>
    ["ADMIN_KEPEGAWAIAN", "SUPERADMIN", "KEPALA_UNIT", "ADMIN_UNIT"].includes(r),
  )
  const employeeId = employeeIdParam ?? authUser.employeeId
  if (!employeeId) return Errors.validation("employee_id wajib untuk akun non-pegawai")
  if (employeeIdParam && employeeIdParam !== authUser.employeeId && !isAdmin) {
    return Errors.forbidden()
  }

  const now = new Date()
  const today = getWibDate(now)

  let roster = await prisma.roster.findUnique({
    where: { employeeId_tanggalKerja: { employeeId, tanggalKerja: today } },
    include: { shift: { select: shiftSelect } },
  })

  // Kalau tidak ada roster hari ini, cek shift kemarin yang crossesMidnight
  // dan windownya masih menutupi `now`.
  if (!roster) {
    const yesterday = new Date(today.getTime() - 86_400_000)
    const yRoster = await prisma.roster.findUnique({
      where: { employeeId_tanggalKerja: { employeeId, tanggalKerja: yesterday } },
      include: { shift: { select: shiftSelect } },
    })
    if (yRoster?.shift.crossesMidnight) {
      const tanggalKerjaHitung = hitungTanggalKerja(now, yRoster.shift)
      if (tanggalKerjaHitung.getTime() === yesterday.getTime()) {
        roster = yRoster
      }
    }
  }

  const overtime = await prisma.overtime.findFirst({
    where: { employeeId, tanggalKerja: today },
    select: { status: true },
    orderBy: { createdAt: "desc" },
  })

  const tanggalWib = today.toISOString().slice(0, 10)

  if (!roster) {
    return NextResponse.json({
      tanggal_wib: tanggalWib,
      roster: null,
      window: null,
      can_check_in: false,
      can_check_out: false,
      overtime_status_today: overtime?.status ?? null,
    })
  }

  const settings = await getAttendanceSettings()
  const window = resolveWindow(roster.shift, roster.tanggalKerja, settings)
  const canCheckIn = now >= window.checkIn.startUtc && now <= window.checkIn.endUtc
  const canCheckOut = now >= window.checkOut.startUtc && now <= window.checkOut.endUtc

  return NextResponse.json({
    tanggal_wib: tanggalWib,
    roster: {
      id: roster.id,
      employee_id: roster.employeeId,
      work_unit_id: roster.workUnitId,
      tanggal_kerja: roster.tanggalKerja.toISOString().slice(0, 10),
      shift: {
        nama: roster.shift.nama,
        start_time: roster.shift.startTime,
        end_time: roster.shift.endTime,
        crosses_midnight: roster.shift.crossesMidnight,
      },
    },
    window: {
      check_in: {
        start: window.checkIn.startUtc.toISOString(),
        end: window.checkIn.endUtc.toISOString(),
        source: window.checkIn.source,
      },
      check_out: {
        start: window.checkOut.startUtc.toISOString(),
        end: window.checkOut.endUtc.toISOString(),
        source: window.checkOut.source,
      },
    },
    can_check_in: canCheckIn,
    can_check_out: canCheckOut,
    overtime_status_today: overtime?.status ?? null,
  })
}
