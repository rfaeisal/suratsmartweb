import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { formatStatus, statusColor } from "@/lib/leave-request-utils"
import { Tooltip } from "@/components/Tooltip"

const STATUS_FILTERS = [
  { value: "", label: "Semua" },
  { value: "PENDING_ADMIN_REVIEW", label: "Menunggu Review" },
  { value: "IN_APPROVAL", label: "Dalam Proses Approval" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "REJECTED", label: "Ditolak" },
  { value: "RETURNED", label: "Dikembalikan" },
  { value: "DELEGATE_DECLINED", label: "Delegasi Ditolak" },
]

type Props = { searchParams: Promise<{ status?: string; page?: string }> }

export default async function AdminLeaveRequestsPage({ searchParams }: Props) {
  const { status = "", page: pageStr = "1" } = await searchParams
  const page = Math.max(1, parseInt(pageStr))
  const limit = 20

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const [requests, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        requester: { select: { fullName: true, nip: true, unit: { select: { name: true } } } },
        leaveType: { select: { name: true } },
        delegate: { select: { fullName: true } },
        approvalSteps: {
          where: { status: "PENDING" },
          select: { stepOrder: true, roleLabel: true, approver: { select: { fullName: true } } },
          orderBy: { stepOrder: "asc" },
          take: 1,
        },
        _count: { select: { approvalSteps: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.leaveRequest.count({ where }),
  ])

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Pengajuan Cuti</h2>
        <span className="text-sm text-gray-500">{total} pengajuan</span>
      </div>

      {/* Filter status */}
      <div className="flex gap-2 flex-wrap mb-5">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/leave-requests?status=${f.value}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === f.value
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">Tidak ada pengajuan cuti.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">No. Pengajuan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Pegawai</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Jenis Cuti</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tanggal</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.requestNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.requester.fullName}</p>
                    <p className="text-xs text-gray-400">{r.requester.unit?.name ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.leaveType.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.startDate).toLocaleDateString("id-ID")} —{" "}
                    {new Date(r.endDate).toLocaleDateString("id-ID")}
                    <span className="block text-gray-400">{r.totalDays} hari</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                      {formatStatus(r.status)}
                    </span>
                    {r.approvalSteps[0] && (
                      <p className="text-xs text-gray-400 mt-1">
                        {(r.status === "IN_APPROVAL") && (
                          <span>Langkah {r.approvalSteps[0].stepOrder}/{r._count.approvalSteps} — </span>
                        )}
                        {r.approvalSteps[0].approver.fullName}
                        <span className="text-gray-300"> ({r.approvalSteps[0].roleLabel})</span>
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Tooltip label="Lihat detail">
                      <Link
                        href={`/admin/leave-requests/${r.id}`}
                        className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors inline-flex"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </Link>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 mt-4 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/leave-requests?status=${status}&page=${p}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                p === page ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
