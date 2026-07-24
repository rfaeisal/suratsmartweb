import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { NewSwapForm, SwapActions } from "./ShiftSwapsClient"

const STATUS_LABEL: Record<string, string> = {
  MENUNGGU_TARGET: "Menunggu Persetujuan Tujuan",
  MENUNGGU_KEPALA: "Menunggu Kepala Unit",
  DISETUJUI:       "Disetujui",
  DITOLAK:         "Ditolak",
}

const STATUS_COLOR: Record<string, string> = {
  MENUNGGU_TARGET: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  MENUNGGU_KEPALA: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  DISETUJUI:       "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  DITOLAK:         "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

function formatDate(dateStr: string | Date) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  })
}

export default async function ShiftSwapsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const empId = session.user.employeeId

  const employee = await prisma.employee.findUnique({
    where: { id: empId },
    select: { unitId: true },
  })
  if (!employee?.unitId) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        Akun Anda belum dikaitkan dengan unit kerja. Hubungi administrator.
      </div>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [swaps, myRosters, unitEmployees] = await Promise.all([
    prisma.shiftSwapRequest.findMany({
      where: { OR: [{ requesterId: empId }, { targetId: empId }] },
      include: {
        requester: { select: { id: true, fullName: true } },
        target:    { select: { id: true, fullName: true } },
        requesterRoster: { select: { tanggalKerja: true, shift: { select: { nama: true } } } },
        targetRoster:    { select: { tanggalKerja: true, shift: { select: { nama: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.roster.findMany({
      where: { employeeId: empId, tanggalKerja: { gte: today } },
      include: { shift: { select: { nama: true } } },
      orderBy: { tanggalKerja: "asc" },
      take: 60,
    }),
    prisma.employee.findMany({
      where: { unitId: employee.unitId, isActive: true, id: { not: empId } },
      select: { id: true, fullName: true, nip: true },
      orderBy: { fullName: "asc" },
    }),
  ])

  const incoming = swaps.filter(
    (s) => s.targetId === empId && s.status === "MENUNGGU_TARGET"
  )

  const myRosterOptions = myRosters.map((r) => ({
    id: r.id,
    tanggalKerja: r.tanggalKerja.toISOString(),
    shiftNama: r.shift?.nama ?? "—",
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Tukar Shift</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Ajukan permintaan tukar shift dengan rekan satu unit.
        </p>
      </div>

      {/* Permintaan masuk */}
      {incoming.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-3">
            Permintaan Masuk ({incoming.length})
          </h3>
          <div className="space-y-3">
            {incoming.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 bg-white dark:bg-slate-800 rounded-lg border border-yellow-100 dark:border-yellow-900/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {s.requester.fullName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Memberikan shift {formatDate(s.requesterRoster.tanggalKerja)}{" "}
                    <span className="font-medium">{s.requesterRoster.shift?.nama}</span>
                    {" "}↔{" "}
                    Menerima shift {formatDate(s.targetRoster.tanggalKerja)}{" "}
                    <span className="font-medium">{s.targetRoster.shift?.nama}</span> milik Anda
                  </p>
                  {s.alasan && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">"{s.alasan}"</p>
                  )}
                </div>
                <SwapActions swapId={s.id} role="target" status={s.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form ajukan tukar shift */}
      {myRosterOptions.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4">Ajukan Tukar Shift Baru</h3>
          <NewSwapForm unitEmployees={unitEmployees} myRosters={myRosterOptions} />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <p className="text-sm text-gray-400 dark:text-slate-500">
            Tidak ada jadwal mendatang yang bisa ditukar.
          </p>
        </div>
      )}

      {/* Riwayat semua permintaan */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
        <div className="px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200">Riwayat Permintaan</h3>
        </div>
        {swaps.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">
            Belum ada permintaan tukar shift.
          </p>
        ) : (
          swaps.map((s) => {
            const isRequester = s.requesterId === empId
            return (
              <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      isRequester
                        ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300"
                        : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {isRequester ? "Saya ajukan" : "Diterima dari " + s.requester.fullName}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-slate-200">
                    {formatDate(s.requesterRoster.tanggalKerja)}{" "}
                    <span className="font-medium">{s.requesterRoster.shift?.nama}</span>
                    <span className="text-gray-400 mx-1.5">↔</span>
                    {formatDate(s.targetRoster.tanggalKerja)}{" "}
                    <span className="font-medium">{s.targetRoster.shift?.nama}</span>
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    {isRequester
                      ? `Dengan ${s.target.fullName}`
                      : `Dengan ${s.requester.fullName}`
                    }
                    {" · "}
                    {new Date(s.createdAt).toLocaleDateString("id-ID", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
