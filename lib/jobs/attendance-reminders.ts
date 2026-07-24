import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { getWibDate, shiftStartUtc, shiftEndUtc } from "@/lib/tanggal-kerja"

export interface AttendanceRemindersResult {
  checkinNotified: number
  checkoutNotified: number
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
}

/**
 * Kirim pengingat absensi:
 * - "Belum absen masuk" — jika shift sudah mulai sejak > grace_minutes, belum ada MASUK
 * - "Belum absen pulang" — jika shift sudah selesai sejak > grace_minutes, ada MASUK tapi belum PULANG
 *
 * Window 1 jam dipakai agar cron yang berjalan tiap jam hanya mengirim sekali per shift.
 * Shift lintas tengah malam (crossesMidnight=true) dari hari kemarin juga dicek untuk PULANG.
 */
export async function sendAttendanceReminders(graceMins: number = 30): Promise<AttendanceRemindersResult> {
  const now = new Date()
  const todayWib = getWibDate(now)
  const yesterdayWib = new Date(todayWib.getTime() - 86_400_000)
  const gracePeriodMs = graceMins * 60_000
  const windowMs = 60 * 60_000 // notifikasi hanya dikirim dalam jendela 1 jam

  const [todayRosters, yesterdayRosters] = await Promise.all([
    prisma.roster.findMany({
      where: { tanggalKerja: todayWib },
      include: { shift: { select: { nama: true, startTime: true, endTime: true, crossesMidnight: true } } },
    }),
    prisma.roster.findMany({
      where: { tanggalKerja: yesterdayWib },
      include: { shift: { select: { nama: true, startTime: true, endTime: true, crossesMidnight: true } } },
    }),
  ])

  // ── Kandidat belum masuk: roster hari ini yang shiftnya sudah mulai ──────────
  const checkinCandidates = todayRosters.filter((r) => {
    const elapsed = now.getTime() - shiftStartUtc(r.tanggalKerja, r.shift.startTime).getTime()
    return elapsed >= gracePeriodMs && elapsed < gracePeriodMs + windowMs
  })

  // ── Kandidat belum pulang: shift normal hari ini + shift cross-midnight kemarin
  const checkoutCandidates = [
    ...todayRosters
      .filter((r) => !r.shift.crossesMidnight)
      .filter((r) => {
        const elapsed = now.getTime() - shiftEndUtc(r.tanggalKerja, r.shift.endTime, false).getTime()
        return elapsed >= gracePeriodMs && elapsed < gracePeriodMs + windowMs
      }),
    ...yesterdayRosters
      .filter((r) => r.shift.crossesMidnight)
      .filter((r) => {
        const elapsed = now.getTime() - shiftEndUtc(r.tanggalKerja, r.shift.endTime, true).getTime()
        return elapsed >= gracePeriodMs && elapsed < gracePeriodMs + windowMs
      }),
  ]

  if (checkinCandidates.length === 0 && checkoutCandidates.length === 0) {
    return { checkinNotified: 0, checkoutNotified: 0 }
  }

  // ── Ambil data absensi sekali untuk semua kandidat ───────────────────────────
  const allEmployeeIds = [
    ...new Set([
      ...checkinCandidates.map((r) => r.employeeId),
      ...checkoutCandidates.map((r) => r.employeeId),
    ]),
  ]

  const existing = await prisma.attendance.findMany({
    where: {
      employeeId: { in: allEmployeeIds },
      tanggalKerja: { in: [todayWib, yesterdayWib] },
    },
    select: { employeeId: true, tanggalKerja: true, eventType: true },
  })

  // Map: "employeeId:tanggalMs" → Set<eventType>
  const attendanceMap = new Map<string, Set<string>>()
  for (const a of existing) {
    const key = `${a.employeeId}:${a.tanggalKerja.getTime()}`
    if (!attendanceMap.has(key)) attendanceMap.set(key, new Set())
    attendanceMap.get(key)!.add(a.eventType)
  }
  const hasEvent = (empId: string, date: Date, eventType: string) =>
    attendanceMap.get(`${empId}:${date.getTime()}`)?.has(eventType) ?? false

  // ── Filter yang benar-benar belum absen ──────────────────────────────────────
  const needsCheckin = checkinCandidates.filter(
    (r) => !hasEvent(r.employeeId, r.tanggalKerja, "MASUK"),
  )
  const needsCheckout = checkoutCandidates.filter(
    (r) =>
      hasEvent(r.employeeId, r.tanggalKerja, "MASUK") &&
      !hasEvent(r.employeeId, r.tanggalKerja, "PULANG"),
  )

  // ── Cari AppUser untuk semua yang perlu dinotifikasi ────────────────────────
  const toNotifyIds = [
    ...new Set([
      ...needsCheckin.map((r) => r.employeeId),
      ...needsCheckout.map((r) => r.employeeId),
    ]),
  ]

  const appUsers = await prisma.appUser.findMany({
    where: { employeeId: { in: toNotifyIds } },
    select: { id: true, employeeId: true },
  })
  const userByEmployeeId = new Map(appUsers.map((u) => [u.employeeId, u.id]))

  let checkinNotified = 0
  let checkoutNotified = 0

  for (const r of needsCheckin) {
    const userId = userByEmployeeId.get(r.employeeId)
    if (!userId) continue
    await sendNotification({
      event: "ATTENDANCE_MISSING_CHECKIN",
      targetUserId: userId,
      data: { shiftName: r.shift.nama, tanggalKerja: formatDate(r.tanggalKerja) },
    })
    checkinNotified++
  }

  for (const r of needsCheckout) {
    const userId = userByEmployeeId.get(r.employeeId)
    if (!userId) continue
    await sendNotification({
      event: "ATTENDANCE_MISSING_CHECKOUT",
      targetUserId: userId,
      data: { shiftName: r.shift.nama, tanggalKerja: formatDate(r.tanggalKerja) },
    })
    checkoutNotified++
  }

  return { checkinNotified, checkoutNotified }
}
