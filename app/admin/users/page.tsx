import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import UsersClient from "./UsersClient"

export default async function AdminUsersPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.roles.includes("SUPERADMIN")) {
    redirect("/admin/dashboard")
  }

  const isSuperadmin = session.user.roles.includes("SUPERADMIN")

  const [users, neverLoggedIn] = await Promise.all([
    prisma.appUser.findMany({
      select: {
        id: true,
        roles: true,
        username: true,
        employee: { select: { fullName: true, nip: true, positionTitle: true, unit: { select: { name: true } } } },
      },
      orderBy: { employee: { fullName: "asc" } },
    }),
    prisma.employee.findMany({
      where: { isActive: true, user: null },
      select: {
        id: true,
        nip: true,
        fullName: true,
        employeeType: true,
        positionTitle: true,
        unit: { select: { name: true } },
      },
      orderBy: { fullName: "asc" },
    }).then((rows) =>
      rows.map((e) => ({ ...e, employeeType: e.employeeType as string }))
    ),
  ])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Manajemen Pengguna</h1>
      <p className="text-sm text-gray-500 mb-6">
        Kelola role pengguna dan pantau pegawai yang belum pernah login.
      </p>
      <UsersClient users={users} neverLoggedIn={neverLoggedIn} isSuperadmin={isSuperadmin} />
    </div>
  )
}
