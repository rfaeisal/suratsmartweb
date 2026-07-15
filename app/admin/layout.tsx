import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const roles = session.user.roles
  if (!roles.includes("ADMIN_KEPEGAWAIAN") && !roles.includes("SUPERADMIN")) {
    redirect("/login")
  }

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/leave-requests", label: "Pengajuan Cuti" },
    { href: "/admin/reports", label: "Rekap Cuti" },
    { href: "/admin/audit-logs", label: "Audit Log" },
    { href: "/admin/leave-types", label: "Jenis Cuti" },
    { href: "/admin/units", label: "Unit Kerja" },
    { href: "/admin/sessions", label: "Manajemen Sesi" },
    { href: "/admin/users", label: "Manajemen Pengguna" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">CutiSmart</h1>
          <p className="text-xs text-gray-500 mt-0.5">Admin Panel</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-gray-900 truncate">{session.user.name}</p>
            <p className="text-xs text-gray-500 truncate">{session.user.roles.join(" / ")}</p>
          </div>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button
              type="submit"
              className="w-full mt-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left"
            >
              Keluar
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
