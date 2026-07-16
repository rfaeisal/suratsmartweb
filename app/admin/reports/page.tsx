import { prisma } from "@/lib/prisma"
import Link from "next/link"

type Props = {
  searchParams: Promise<{
    from?: string
    to?: string
    unitId?: string
    leaveTypeId?: string
    employeeType?: string
    page?: string
  }>
}

const EMPLOYEE_TYPES = ["PNS", "PPPK", "BLUD"]

export default async function ReportsPage({ searchParams }: Props) {
  const {
    from,
    to,
    unitId,
    leaveTypeId,
    employeeType,
    page: pageStr = "1",
  } = await searchParams

  const page = Math.max(1, parseInt(pageStr))
  const limit = 25

  const currentYear = new Date().getFullYear()
  const defaultFrom = `${currentYear}-01-01`
  const defaultTo = `${currentYear}-12-31`
  const dateFrom = new Date(from ?? defaultFrom)
  const dateTo = new Date(to ?? defaultTo)
  dateTo.setHours(23, 59, 59, 999)

  const [units, leaveTypes] = await Promise.all([
    prisma.workUnit.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leaveType.findMany({ select: { id: true, name: true }, where: { isActive: true }, orderBy: { name: "asc" } }),
  ])

  // Bangun where clause
  const where: Record<string, unknown> = {
    startDate: { gte: dateFrom },
    endDate: { lte: dateTo },
    status: { in: ["APPROVED", "SENT_TO_LEGACY"] },
  }
  if (leaveTypeId) where.leaveTypeId = leaveTypeId
  if (unitId || employeeType) {
    where.requester = {
      ...(unitId ? { unitId } : {}),
      ...(employeeType ? { employeeType } : {}),
    }
  }

  const [requests, total, summary] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        requester: {
          select: {
            fullName: true,
            nip: true,
            employeeType: true,
            unit: { select: { name: true } },
          },
        },
        leaveType: { select: { name: true } },
        skDocument: { select: { skNumber: true } },
      },
      orderBy: { startDate: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.aggregate({
      where,
      _sum: { totalDays: true },
      _count: { _all: true },
    }),
  ])

  const totalPages = Math.ceil(total / limit)
  const totalDays = summary._sum.totalDays ?? 0

  function buildUrl(params: Record<string, string>) {
    const sp = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(unitId ? { unitId } : {}),
      ...(leaveTypeId ? { leaveTypeId } : {}),
      ...(employeeType ? { employeeType } : {}),
      ...params,
    })
    return `/admin/reports?${sp.toString()}`
  }

  const inputClass =
    "px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Rekap Cuti</h2>
        {total > 0 && (
          <a
            href={`/api/v1/admin/reports/export?${new URLSearchParams({
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
              ...(unitId ? { unitId } : {}),
              ...(leaveTypeId ? { leaveTypeId } : {}),
              ...(employeeType ? { employeeType } : {}),
            }).toString()}`}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Export CSV
          </a>
        )}
      </div>

      {/* Filter */}
      <form method="GET" className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dari Tanggal</label>
            <input type="date" name="from" defaultValue={from ?? defaultFrom} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sampai Tanggal</label>
            <input type="date" name="to" defaultValue={to ?? defaultTo} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Kerja</label>
            <select name="unitId" defaultValue={unitId ?? ""} className={inputClass}>
              <option value="">Semua Unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Cuti</label>
            <select name="leaveTypeId" defaultValue={leaveTypeId ?? ""} className={inputClass}>
              <option value="">Semua Jenis</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kategori Pegawai</label>
            <select name="employeeType" defaultValue={employeeType ?? ""} className={inputClass}>
              <option value="">Semua Kategori</option>
              {EMPLOYEE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Terapkan Filter
            </button>
          </div>
        </div>
      </form>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Total Pengajuan Disetujui</p>
          <p className="text-2xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Total Hari Cuti</p>
          <p className="text-2xl font-bold text-gray-900">{totalDays}</p>
        </div>
      </div>

      {/* Tabel hasil */}
      {requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">Tidak ada data cuti yang sesuai filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">No. Pengajuan</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Pegawai</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Jenis Cuti</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Tanggal Mulai</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Tanggal Selesai</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Hari</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nomor SK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      <Link href={`/admin/leave-requests/${r.id}`} className="hover:text-blue-600">
                        {r.requestNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.requester.fullName}</p>
                      <p className="text-xs text-gray-400">{r.requester.unit?.name ?? "—"} · {r.requester.employeeType}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.leaveType.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(r.startDate).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(r.endDate).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{r.totalDays}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.skDocument?.skNumber ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-xs font-medium text-gray-500 text-right">
                    Total (halaman ini):
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">
                    {requests.reduce((s, r) => s + r.totalDays, 0)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
              ← Sebelumnya
            </Link>
          )}
          <span className="px-3 py-1.5 text-xs text-gray-500">
            Halaman {page} dari {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
              Berikutnya →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
