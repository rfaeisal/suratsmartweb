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
  UPDATE_EMPLOYEE: "Update Pegawai",
  UPDATE_SYSTEM_SETTING: "Update Pengaturan",
  DEVICE_ENROLLED: "Device Absensi Enroll",
  FACE_ENROLLMENT_SESSION_CREATED: "Sesi Enrollment Wajah Dibuat",
  FACE_ENROLLMENT_SUBMITTED: "Enrollment Wajah Disubmit",
  FACE_ENROLLMENT_APPROVED: "Enrollment Wajah Disetujui",
  FACE_ENROLLMENT_REJECTED: "Enrollment Wajah Ditolak",
  FACE_ENROLLMENT_THUMBNAIL_VIEWED: "Thumbnail Sesi Enroll Dilihat",
  FACE_THUMBNAIL_VIEWED: "Thumbnail Wajah Pegawai Dilihat",
  MANUAL_ATTENDANCE_RECOVERY: "Absen Manual (Recovery)",
  LOGIN: "Login",
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

  // Resolve actor names — actorId adalah AppUser.id (bukan Employee.id),
  // jadi query lewat AppUser → include employee untuk ambil fullName + NIP.
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[]
  const actors = await prisma.appUser.findMany({
    where: { id: { in: actorIds } },
    select: {
      id: true,
      username: true,
      employee: { select: { fullName: true, nip: true } },
    },
  })
  const actorMap = Object.fromEntries(
    actors.map((a) => [
      a.id,
      a.employee?.fullName
        ? `${a.employee.fullName}${a.employee.nip ? ` (${a.employee.nip})` : ""}`
        : a.username ?? a.id,
    ]),
  )

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
    "px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Audit Log</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Riwayat seluruh aksi penting di sistem</p>
      </div>

      {/* Filter */}
      <form method="GET" className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Aksi</label>
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
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Entitas</label>
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
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Reset
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-gray-500 dark:text-slate-400">{total} entri ditemukan</p>

      {logs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
          <p className="text-gray-400 dark:text-slate-500 text-sm">Tidak ada log yang ditemukan.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">Waktu</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400">Aktor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400">Aksi</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400">Entitas</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                    {log.actorId ? actorMap[log.actorId] ?? log.actorId : <span className="text-gray-400 dark:text-slate-500">Sistem</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs rounded font-medium">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                    {log.entityType}
                    {log.entityId && (
                      <span className="block font-mono text-gray-300 dark:text-slate-600 truncate max-w-24" title={log.entityId}>
                        {log.entityId}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-slate-500 max-w-48">
                    {log.metadata && Object.keys(log.metadata as object).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-blue-500 hover:text-blue-700">Lihat</summary>
                        <pre className="mt-1 text-xs bg-gray-50 dark:bg-slate-900 dark:text-slate-300 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
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
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50">
              ← Sebelumnya
            </Link>
          )}
          <span className="px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400">
            Halaman {page} dari {totalPages}
          </span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50">
              Berikutnya →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
