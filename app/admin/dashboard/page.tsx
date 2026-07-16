import { prisma } from "@/lib/prisma"
import Link from "next/link"

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Diajukan",
  DELEGATE_DECLINED: "Delegasi Ditolak",
  PENDING_ADMIN_REVIEW: "Menunggu Review Admin",
  IN_APPROVAL: "Dalam Proses Approval",
  RETURNED: "Dikembalikan",
  REJECTED: "Ditolak",
  APPROVED: "Disetujui",
  SENT_TO_LEGACY: "Terkirim ke Sistem",
  SEND_FAILED: "Gagal Kirim",
}

const STATUS_COLOR: Record<string, string> = {
  SUBMITTED: "bg-gray-100 text-gray-700",
  DELEGATE_DECLINED: "bg-red-50 text-red-700",
  PENDING_ADMIN_REVIEW: "bg-amber-50 text-amber-700",
  IN_APPROVAL: "bg-blue-50 text-blue-700",
  RETURNED: "bg-orange-50 text-orange-700",
  REJECTED: "bg-red-50 text-red-700",
  APPROVED: "bg-green-50 text-green-700",
  SENT_TO_LEGACY: "bg-green-100 text-green-800",
  SEND_FAILED: "bg-red-100 text-red-800",
}

export default async function DashboardPage() {
  const currentYear = new Date().getFullYear()

  const [
    leaveTypeCount,
    unitCount,
    activeSessionCount,
    statusGroups,
    sendFailedCount,
    pendingAdminCount,
    recentRequests,
    topLeaveTypes,
  ] = await Promise.all([
    prisma.leaveType.count({ where: { isActive: true } }),
    prisma.workUnit.count(),
    prisma.userSession.count({ where: { status: "ACTIVE" } }),
    prisma.leaveRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(`${currentYear}-01-01`) } },
    }),
    prisma.leaveRequest.count({ where: { status: "SEND_FAILED" } }),
    prisma.leaveRequest.count({ where: { status: "PENDING_ADMIN_REVIEW" } }),
    prisma.leaveRequest.findMany({
      where: { status: { in: ["PENDING_ADMIN_REVIEW", "SEND_FAILED"] } },
      include: {
        requester: { select: { fullName: true, unit: { select: { name: true } } } },
        leaveType: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(`${currentYear}-01-01`) } },
      orderBy: { _count: { leaveTypeId: "desc" } },
      take: 5,
    }),
  ])

  // Resolve nama jenis cuti
  const leaveTypeIds = topLeaveTypes.map((g) => g.leaveTypeId)
  const leaveTypeNames = await prisma.leaveType.findMany({
    where: { id: { in: leaveTypeIds } },
    select: { id: true, name: true },
  })
  const ltNameMap = Object.fromEntries(leaveTypeNames.map((lt) => [lt.id, lt.name]))

  const totalThisYear = statusGroups.reduce((sum, g) => sum + g._count._all, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">Ringkasan sistem CutiSmart — Tahun {currentYear}</p>
      </div>

      {/* Alert: butuh perhatian */}
      {(pendingAdminCount > 0 || sendFailedCount > 0) && (
        <div className="space-y-2">
          {pendingAdminCount > 0 && (
            <Link href="/admin/leave-requests?status=PENDING_ADMIN_REVIEW">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 hover:bg-amber-100 transition-colors">
                <span className="font-medium">{pendingAdminCount} pengajuan</span>
                <span>menunggu penetapan alur approval</span>
                <span className="ml-auto text-xs shrink-0">Lihat →</span>
              </div>
            </Link>
          )}
          {sendFailedCount > 0 && (
            <Link href="/admin/leave-requests?status=SEND_FAILED">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 hover:bg-red-100 transition-colors">
                <span className="font-medium">{sendFailedCount} pengajuan</span>
                <span>gagal dikirim ke EHOS — perlu kirim ulang</span>
                <span className="ml-auto text-xs shrink-0">Lihat →</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Pengajuan Tahun Ini", value: totalThisYear, href: "/admin/leave-requests" },
          { label: "Jenis Cuti Aktif", value: leaveTypeCount, href: "/admin/leave-types" },
          { label: "Unit Kerja", value: unitCount, href: "/admin/units" },
          { label: "Sesi Mobile Aktif", value: activeSessionCount, href: "/admin/sessions" },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 hover:shadow-md transition-shadow">
              <p className="text-xs text-gray-500 leading-tight">{stat.label}</p>
              <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pengajuan per status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-4">Distribusi Status Pengajuan</h3>
          {statusGroups.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada pengajuan tahun ini.</p>
          ) : (
            <div className="space-y-2">
              {statusGroups
                .sort((a, b) => b._count._all - a._count._all)
                .map((g) => (
                  <Link
                    key={g.status}
                    href={`/admin/leave-requests?status=${g.status}`}
                    className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                  >
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[g.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[g.status] ?? g.status}
                    </span>
                    <span className="ml-auto font-semibold text-gray-900 text-sm">{g._count._all}</span>
                    <div className="w-12 md:w-20 bg-gray-100 rounded-full h-1.5 shrink-0">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${Math.round((g._count._all / totalThisYear) * 100)}%` }}
                      />
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </div>

        {/* Top jenis cuti */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-4">Jenis Cuti Terbanyak Diajukan</h3>
          {topLeaveTypes.length === 0 ? (
            <p className="text-sm text-gray-400">Belum ada data.</p>
          ) : (
            <div className="space-y-3">
              {topLeaveTypes.map((g) => (
                <div key={g.leaveTypeId} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 flex-1">{ltNameMap[g.leaveTypeId] ?? "—"}</span>
                  <span className="text-sm font-semibold text-gray-900">{g._count._all}</span>
                  <div className="w-16 md:w-24 bg-gray-100 rounded-full h-1.5 shrink-0">
                    <div
                      className="bg-green-500 h-1.5 rounded-full"
                      style={{ width: `${Math.round((g._count._all / totalThisYear) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pengajuan yang butuh tindakan */}
      {recentRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 text-sm">Membutuhkan Tindakan</h3>
            <Link href="/admin/leave-requests" className="text-xs text-blue-600 hover:underline">Lihat semua →</Link>
          </div>
          <div className="space-y-2">
            {recentRequests.map((r) => (
              <Link
                key={r.id}
                href={`/admin/leave-requests/${r.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.requester.fullName}</p>
                  <p className="text-xs text-gray-500">{r.leaveType.name} — {r.requester.unit?.name ?? "—"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${STATUS_COLOR[r.status] ?? ""}`}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Menu cepat */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-medium text-gray-900 text-sm mb-3">Menu Cepat</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Pengajuan Masuk", href: "/admin/leave-requests?status=PENDING_ADMIN_REVIEW" },
            { label: "Rekap Cuti", href: "/admin/reports" },
            { label: "Audit Log", href: "/admin/audit-logs" },
            { label: "Atur Kuota Cuti", href: "/admin/leave-types" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center justify-center p-3 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-lg text-sm text-gray-700 text-center transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
