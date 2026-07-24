import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

const EVENT_LABEL: Record<string, string> = {
  MASUK:        "Masuk",
  PULANG:       "Pulang",
  LEMBUR_MASUK: "Lembur Masuk",
  LEMBUR_PULANG: "Lembur Pulang",
}

const EVENT_COLOR: Record<string, string> = {
  MASUK:        "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PULANG:       "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  LEMBUR_MASUK: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  LEMBUR_PULANG: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
}

const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const empId = session.user.employeeId
  const params = await searchParams

  const now = new Date()
  const year  = params.year  ? parseInt(params.year)  : now.getFullYear()
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1

  const from = new Date(Date.UTC(year, month - 1, 1))
  const to   = new Date(Date.UTC(year, month, 0))

  const [attendances, alphas, rosters] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        employeeId: empId,
        tanggalKerja: { gte: from, lte: to },
      },
      orderBy: { recordedAt: "asc" },
    }),
    prisma.alphaRecord.findMany({
      where: {
        employeeId: empId,
        tanggalKerja: { gte: from, lte: to },
      },
      select: { tanggalKerja: true },
    }),
    prisma.roster.findMany({
      where: {
        employeeId: empId,
        tanggalKerja: { gte: from, lte: to },
      },
      include: { shift: { select: { nama: true, startTime: true, endTime: true } } },
      orderBy: { tanggalKerja: "asc" },
    }),
  ])

  // Group attendances by tanggalKerja (YYYY-MM-DD)
  const byDay = new Map<string, typeof attendances>()
  for (const a of attendances) {
    const key = a.tanggalKerja.toISOString().slice(0, 10)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(a)
  }

  const alphaSet = new Set(alphas.map((a) => a.tanggalKerja.toISOString().slice(0, 10)))

  // Build roster map for quick lookup
  const rosterByDay = new Map(rosters.map((r) => [r.tanggalKerja.toISOString().slice(0, 10), r]))

  // Summary
  const hadirDays = new Set(attendances.filter((a) => a.status === "VALID").map((a) => a.tanggalKerja.toISOString().slice(0, 10)))
  const terlambatDays = new Set(attendances.filter((a) => a.telat).map((a) => a.tanggalKerja.toISOString().slice(0, 10)))
  const summary = {
    hadir:     hadirDays.size,
    alpha:     alphaSet.size,
    terlambat: terlambatDays.size,
    rosters:   rosters.length,
  }

  // Build list of all days with roster or attendance or alpha
  const allDayKeys = new Set([
    ...rosters.map((r) => r.tanggalKerja.toISOString().slice(0, 10)),
    ...attendances.map((a) => a.tanggalKerja.toISOString().slice(0, 10)),
    ...alphas.map((a) => a.tanggalKerja.toISOString().slice(0, 10)),
  ])
  const sortedDays = [...allDayKeys].sort((a, b) => b.localeCompare(a))

  const prevMonth = month === 1 ? `year=${year - 1}&month=12` : `year=${year}&month=${month - 1}`
  const nextMonth = month === 12 ? `year=${year + 1}&month=1` : `year=${year}&month=${month + 1}`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Kehadiran Saya</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Riwayat absensi dan jadwal kerja.</p>
      </div>

      {/* Navigasi bulan */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-5 py-3 flex items-center justify-between">
        <a
          href={`/pegawai/attendance?${prevMonth}`}
          className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </a>
        <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <a
          href={`/pegawai/attendance?${nextMonth}`}
          className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </a>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Hari Kerja", value: summary.rosters, color: "text-gray-700 dark:text-slate-200" },
          { label: "Hadir",      value: summary.hadir,   color: "text-green-600 dark:text-green-400" },
          { label: "Alpha",      value: summary.alpha,   color: "text-red-600 dark:text-red-400" },
          { label: "Terlambat",  value: summary.terlambat, color: "text-orange-500 dark:text-orange-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Daftar hari */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
        {sortedDays.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">
            Tidak ada data kehadiran untuk bulan ini.
          </p>
        ) : (
          sortedDays.map((dayKey) => {
            const date   = new Date(dayKey + "T00:00:00Z")
            const dow    = date.getUTCDay()
            const events = byDay.get(dayKey) ?? []
            const roster = rosterByDay.get(dayKey)
            const isAlpha  = alphaSet.has(dayKey)
            const isSunday = dow === 0
            const hasMasuk = events.some((e) => e.eventType === "MASUK")
            const hasTelat = events.some((e) => e.telat)

            return (
              <div key={dayKey} className={`flex items-start gap-4 px-5 py-3 ${isSunday ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}>
                {/* Tanggal */}
                <div className="shrink-0 w-10 text-center pt-0.5">
                  <p className={`text-xs font-medium ${isSunday ? "text-red-400" : "text-gray-400 dark:text-slate-500"}`}>
                    {DAY_SHORT[dow]}
                  </p>
                  <p className={`text-lg font-bold leading-tight ${isSunday ? "text-red-500 dark:text-red-400" : "text-gray-800 dark:text-slate-200"}`}>
                    {date.getUTCDate()}
                  </p>
                </div>

                {/* Konten */}
                <div className="flex-1 min-w-0">
                  {/* Shift */}
                  {roster && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-1.5">
                      <span className="font-medium text-gray-700 dark:text-slate-300">{roster.shift?.nama}</span>
                      {roster.shift && (
                        <span className="ml-1">{roster.shift.startTime}–{roster.shift.endTime}</span>
                      )}
                    </p>
                  )}

                  {/* Events absensi */}
                  {events.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {events.map((e) => (
                        <span key={e.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${EVENT_COLOR[e.eventType]}`}>
                          {EVENT_LABEL[e.eventType]}
                          <span className="opacity-70">
                            {new Date(e.recordedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : isAlpha ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                      Alpha
                    </span>
                  ) : roster ? (
                    <span className="text-xs text-gray-300 dark:text-slate-600">Belum absen</span>
                  ) : null}
                </div>

                {/* Badge kanan */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {hasMasuk && !isAlpha && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      hasTelat
                        ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300"
                        : "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300"
                    }`}>
                      {hasTelat ? "Terlambat" : "Tepat Waktu"}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
