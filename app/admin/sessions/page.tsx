import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { writeAuditLog } from "@/lib/audit"

async function revokeSession(sessionId: string, adminUserId: string) {
  "use server"
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedBy: adminUserId },
  })
  await writeAuditLog({
    actorId: adminUserId,
    action: "FORCE_REVOKE_SESSION",
    entityType: "UserSession",
    entityId: sessionId,
  })
  revalidatePath("/admin/sessions")
}

export default async function SessionsPage() {
  const session = await auth()
  const adminUserId = session?.user?.id ?? ""

  const activeSessions = await prisma.userSession.findMany({
    where: { status: "ACTIVE" },
    include: {
      user: {
        include: {
          employee: { select: { nip: true, fullName: true, unit: { select: { name: true } } } },
        },
      },
    },
    orderBy: { lastActiveAt: "desc" },
  })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Manajemen Sesi Login</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pantau dan kelola sesi login aktif pegawai. Gunakan untuk force sign-out jika pegawai
          kehilangan perangkat atau perlu pindah device.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-medium text-gray-700">
            Sesi Aktif: {activeSessions.length}
          </span>
        </div>

        {activeSessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            Tidak ada sesi aktif saat ini.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Pegawai</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Unit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Perangkat</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Login Sejak</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Aktif Terakhir</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeSessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.user.employee.fullName}</p>
                    <p className="text-xs text-gray-500">{s.user.employee.nip}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.user.employee.unit.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <p>{s.deviceLabel ?? "–"}</p>
                    <p className="text-xs text-gray-400 font-mono">{s.deviceId.slice(0, 12)}…</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(s.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(s.lastActiveAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={revokeSession.bind(null, s.id, adminUserId)}>
                      <button
                        type="submit"
                        title="Force Sign-out"
                        className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
