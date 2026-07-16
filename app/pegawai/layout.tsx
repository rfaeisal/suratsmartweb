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
    prisma.approvalStep.findMany({
      where: {
        approverId: employeeId,
        status: "PENDING",
        leaveRequest: { status: { in: ["IN_APPROVAL", "PENDING_KEPALA_RUANGAN"] } },
      },
      select: { stepOrder: true, leaveRequest: { select: { currentStepOrder: true } } },
    }).then((steps) => steps.filter((s) => s.stepOrder === s.leaveRequest.currentStepOrder).length),
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
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 h-full">
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

        <div className="border-t border-gray-200">
          {(session.user.roles.includes("ADMIN_KEPEGAWAIAN") || session.user.roles.includes("SUPERADMIN")) && (
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors border-b border-gray-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              Admin Panel
            </Link>
          )}
          <div className="px-3 py-2 flex items-center gap-2">
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
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
