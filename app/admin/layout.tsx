import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { SidebarLayout } from "@/components/SidebarLayout"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const roles = session.user.roles
  if (!roles.includes("ADMIN_KEPEGAWAIAN") && !roles.includes("SUPERADMIN")) {
    redirect("/login")
  }

  const isSuperAdmin = roles.includes("SUPERADMIN")

  type NavItem = { href: string; label: string }
  type NavGroup = { group: string; items: NavItem[] }

  const navGroups: NavGroup[] = [
    {
      group: "",
      items: [
        { href: "/admin/dashboard", label: "Dashboard" },
        { href: "/admin/leave-requests", label: "Pengajuan Cuti" },
        { href: "/admin/reports", label: "Rekap Cuti" },
      ],
    },
    {
      group: "Kepegawaian",
      items: [
        { href: "/admin/employees", label: "Daftar Pegawai" },
        { href: "/admin/sync", label: "Sinkronisasi Pegawai" },
      ],
    },
    {
      group: "Master Data",
      items: [
        { href: "/admin/leave-types", label: "Master Jenis Cuti" },
        { href: "/admin/units", label: "Master Unit Kerja" },
        { href: "/admin/positions", label: "Master Jabatan" },
      ],
    },
    ...(isSuperAdmin ? [{
      group: "Administrasi",
      items: [
        { href: "/admin/users", label: "Manajemen Pengguna" },
        { href: "/admin/sessions", label: "Manajemen Sesi" },
        { href: "/admin/audit-logs", label: "Audit Log" },
      ],
    }] : []),
  ]

  const sidebar = (
    <>
      <div className="px-6 py-5 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">CutiSmart</h1>
        <p className="text-xs text-gray-500 mt-0.5">Admin Panel</p>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.group}>
            {group.group && (
              <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {group.group}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-2 border-t border-gray-200 flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-semibold text-indigo-600">
            {session.user.name?.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{session.user.name}</p>
          <p className="text-[10px] text-gray-400 truncate leading-tight">NIP. {session.user.nip}</p>
        </div>
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <button
            type="submit"
            title="Keluar"
            className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </form>
      </div>
    </>
  )

  return (
    <SidebarLayout sidebar={sidebar} title="CutiSmart — Admin">
      {children}
    </SidebarLayout>
  )
}
