import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { formatStatus, statusColor } from "@/lib/leave-request-utils"
import Link from "next/link"

export default async function PegawaiDashboardPage() {
  const session = await auth()
  const employeeId = session?.user?.employeeId ?? ""

  const [requests, employee] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { requesterId: employeeId },
      include: {
        leaveType: { select: { name: true } },
        approvalSteps: {
          where: { status: "PENDING" },
          select: { stepOrder: true, roleLabel: true, approver: { select: { fullName: true } } },
          orderBy: { stepOrder: "asc" },
          take: 1,
        },
        _count: { select: { approvalSteps: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      include: { unit: { select: { name: true } } },
    }),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Pengajuan Cuti Saya</h2>
          {employee && (
            <p className="text-sm text-gray-500 mt-0.5">
              {employee.fullName} — {employee.unit?.name ?? "—"} ({employee.employeeType})
            </p>
          )}
        </div>
        <Link
          href="/pegawai/leave-requests/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Ajukan Cuti
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">Belum ada pengajuan cuti.</p>
          <Link
            href="/pegawai/leave-requests/new"
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Ajukan cuti pertama Anda →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Link key={r.id} href={`/pegawai/leave-requests/${r.id}`}>
              <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">{r.requestNumber}</span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}
                      >
                        {formatStatus(r.status)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">{r.leaveType.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(r.startDate).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      —{" "}
                      {new Date(r.endDate).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      <span className="text-gray-400">({r.totalDays} hari)</span>
                    </p>
                    {r.approvalSteps[0] && (
                      <p className="text-xs text-gray-400 mt-1">
                        Menunggu:{" "}
                        <span className="text-gray-600">{r.approvalSteps[0].approver.fullName}</span>
                        <span className="text-gray-300"> ({r.approvalSteps[0].roleLabel})</span>
                        {r.status === "IN_APPROVAL" && (
                          <span className="text-gray-300"> · Langkah {r.approvalSteps[0].stepOrder}/{r._count.approvalSteps}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(r.createdAt).toLocaleDateString("id-ID")}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
