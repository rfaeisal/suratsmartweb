import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import UserRolesForm from "./UserRolesForm"

const ALL_ROLES = ["PEGAWAI", "APPROVER", "ADMIN_KEPEGAWAIAN", "SUPERADMIN"] as const

export default async function AdminUsersPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    redirect("/pegawai/dashboard")
  }

  const isSuperadmin = session.user.roles.includes("SUPERADMIN")

  const users = await prisma.appUser.findMany({
    include: { employee: { select: { fullName: true, nip: true, positionTitle: true, unit: { select: { name: true } } } } },
    orderBy: { employee: { fullName: "asc" } },
  })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Manajemen Role Pengguna</h1>
      <p className="text-sm text-gray-500 mb-6">
        Satu pengguna dapat memiliki lebih dari satu role sekaligus.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {users.map((user) => {
          const isTargetSuperadmin = user.roles.includes("SUPERADMIN")
          const canEdit = isSuperadmin || !isTargetSuperadmin
          return (
            <div key={user.id} className="px-5 py-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{user.employee.fullName}</p>
                <p className="text-xs text-gray-500">
                  {user.employee.nip} · {user.employee.positionTitle ?? "—"} · {user.employee.unit.name}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {user.roles.map((r) => (
                    <span
                      key={r}
                      className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              {canEdit ? (
                <UserRolesForm
                  userId={user.id}
                  currentRoles={user.roles}
                  allRoles={isSuperadmin ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "SUPERADMIN")}
                />
              ) : (
                <span className="text-xs text-gray-400 mt-1">Hanya SUPERADMIN yang bisa mengubah</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
