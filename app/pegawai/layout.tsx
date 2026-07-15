import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export default async function PegawaiLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const employeeId = session.user.employeeId

  const [pendingDelegations, pendingApprovals] = await Promise.all([
    prisma.leaveRequest.count({
      where: {
        delegateId: employeeId,
        delegateConfirmationStatus: "PENDING",
        status: "SUBMITTED",
      },
    }),
    prisma.approvalStep.count({
      where: {
        approverId: employeeId,
        status: "PENDING",
        leaveRequest: { status: "IN_APPROVAL" },
      },
    }),
  ])

  const navItems = [
    { href: "/pegawai/dashboard", label: "Pengajuan Saya", badge: false },
    {
      href: "/pegawai/delegate-inbox",
      label: `Konfirmasi Delegasi${pendingDelegations > 0 ? ` (${pendingDelegations})` : ""}`,
      badge: pendingDelegations > 0,
    },
    {
      href: "/pegawai/approvals",
      label: `Inbox Approval${pendingApprovals > 0 ? ` (${pendingApprovals})` : ""}`,
      badge: pendingApprovals > 0,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">CutiSmart</h1>
          <p className="text-xs text-gray-500 mt-0.5">Portal Pegawai</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                item.badge
                  ? "text-blue-700 font-medium hover:bg-blue-50"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              }`}
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
          {(session.user.roles.includes("ADMIN_KEPEGAWAIAN") || session.user.roles.includes("SUPERADMIN")) && (
            <Link
              href="/admin/dashboard"
              className="block w-full mt-1 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              → Admin Panel
            </Link>
          )}
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button
              type="submit"
              className="w-full mt-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left"
            >
              Keluar
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
