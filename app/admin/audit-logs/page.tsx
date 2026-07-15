import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"

type Props = {
  searchParams: Promise<{
    action?: string
    entityType?: string
    actorId?: string
    page?: string
  }>
}

const ACTION_LABELS: Record<string, string> = {
  LEAVE_REQUEST_CREATED: "Pengajuan Dibuat",
  DELEGATE_CONFIRMED: "Delegasi Dikonfirmasi",
  DELEGATE_DECLINED: "Delegasi Ditolak",
  SET_APPROVAL_FLOW: "Alur Approval Ditetapkan",
  APPROVAL_APPROVED: "Langkah Disetujui",
  APPROVAL_REJECTED: "Langkah Ditolak",
  APPROVAL_RETURNED: "Langkah Dikembalikan",
  GENERATE_SK: "SK Digenerate",
  SEND_TO_LEGACY: "Kirim ke Sistem Lama",
  SESSION_REVOKED: "Sesi Dicabut",
}

export default async function AuditLogsPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user?.roles.includes("SUPERADMIN")) redirect("/admin/dashboard")

  const {
    action,
    entityType,
    actorId,
    page: pageStr = "1",
  } = await searchParams

  const page = Math.max(1, parseInt(pageStr))
  const limit = 30

  const where: Record<string, unknown> = {}
  if (action) where.action = action
  if (entityType) where.entityType = entityType
  if (actorId) where.actorId = actorId

  const [logs, total, distinctActions, distinctEntities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
    prisma.auditLog.findMany({
      select: { entityType: true },
      distinct: ["entityType"],
      orderBy: { entityType: "asc" },
    }),
  ])

  // Resolve actor names
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[]
  const actors = await prisma.employee.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, fullName: true },
  })
  const actorMap = Object.fromEntries(actors.map((a) => [a.id, a.fullName]))

  const totalPages = Math.ceil(total / limit)

  function buildUrl(params: Record<string, string>) {
    const sp = new URLSearchParams({
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorId ? { actorId } : {}),
      ...params,
    })
    return `/admin/audit-logs?${sp.toString()}`
  }

  const selectClass =
    "px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Audit Log</h2>
        <p className="text-sm text-gray-500 mt-0.5">Riwayat seluruh aksi penting di sistem</p>
      </div>

      {/* Filter */}
      <form method="GET" className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Aksi</label>
            <select name="action" defaultValue={action ?? ""} className={selectClass}>
              <option value="">Semua Aksi</option>
              {distinctActions.map((a) => (
                <option key={a.action} value={a.action}>
                  {ACTION_LABELS[a.action] ?? a.action}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Entitas</label>
            <select name="entityType" defaultValue={entityType ?? ""} className={selectClass}>
              <option value="">Semua Entitas</option>
              {distinctEntities.map((e) => (
                <option key={e.entityType} value={e.entityType}>{e.entityType}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Filter
          </button>
          {(action || entityType || actorId) && (
            <Link
              href="/admin/audit-logs"
              className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-gray-500">{total} entri ditemukan</p>

      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">Tidak ada log yang ditemukan.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Waktu</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Aktor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Aksi</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Entitas</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {log.actorId ? actorMap[log.actorId] ?? log.actorId : <span className="text-gray-400">Sistem</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded font-medium">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {log.entityType}
                    {log.entityId && (
                      <span className="block font-mono text-gray-300 truncate max-w-24" title={log.entityId}>
                        {log.entityId}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-48">
                    {log.metadata && Object.keys(log.metadata as object).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-blue-500 hover:text-blue-700">Lihat</summary>
                        <pre className="mt-1 text-xs bg-gray-50 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
