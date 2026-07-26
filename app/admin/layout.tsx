import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { SidebarLayout } from "@/components/SidebarLayout"
import { AdminSidebar, type NavGroup } from "@/components/AdminSidebar"
import { signOutAction } from "./sign-out"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const roles = session.user.roles
  const canAccessAdmin =
    roles.includes("ADMIN_KEPEGAWAIAN") ||
    roles.includes("SUPERADMIN") ||
    roles.includes("KEPALA_UNIT") ||
    roles.includes("ADMIN_UNIT")
  if (!canAccessAdmin) redirect("/login")

  const isSuperAdmin  = roles.includes("SUPERADMIN")
  const isAdmin       = roles.includes("ADMIN_KEPEGAWAIAN") || isSuperAdmin
  const isKepalaUnit  = roles.includes("KEPALA_UNIT")
  const isAdminUnit   = roles.includes("ADMIN_UNIT")

  // Fetch pending counts untuk badge sidebar (hanya role yang relevan)
  let pendingLeave    = 0
  let pendingOvertime = 0
  let pendingSwaps    = 0
  let pendingRoster   = 0

  if (isAdmin || isKepalaUnit) {
    let managedUnitId: string | null = null
    if (isKepalaUnit && !isAdmin) {
      const appUser = await prisma.appUser.findUnique({
        where: { id: session.user.id },
        select: { managedWorkUnitId: true },
      })
      managedUnitId = appUser?.managedWorkUnitId ?? null
    }

    const unitFilter = managedUnitId ? { workUnitId: managedUnitId } : {}

    const [ot, sw, roster] = await Promise.all([
      isKepalaUnit || isAdmin
        ? prisma.overtime.count({ where: { ...unitFilter, status: "DIAJUKAN" } })
        : Promise.resolve(0),
      isKepalaUnit || isAdmin
        ? prisma.shiftSwapRequest.count({ where: { ...unitFilter, status: "MENUNGGU_KEPALA" } })
        : Promise.resolve(0),
      isKepalaUnit || isAdmin
        ? prisma.rosterPeriod.count({ where: { ...unitFilter, status: "PENDING_APPROVAL" } })
        : Promise.resolve(0),
    ])

    pendingOvertime = ot
    pendingSwaps    = sw
    pendingRoster   = roster

    if (isAdmin) {
      pendingLeave = await prisma.leaveRequest.count({
        where: { status: { in: ["SUBMITTED", "PENDING_ADMIN_REVIEW", "IN_APPROVAL"] } },
      })
    }
  }

  const navGroups: NavGroup[] = [
    ...(isAdmin ? [{
      group: "",
      items: [
        { href: "/admin/dashboard",      label: "Dashboard",      iconName: "dashboard" },
        { href: "/admin/leave-requests", label: "Pengajuan Cuti", iconName: "leave",   badge: pendingLeave || undefined },
        { href: "/admin/reports",        label: "Rekap Cuti",     iconName: "report" },
      ],
    }] : []),
    ...(isAdmin ? [{
      group: "Kepegawaian",
      items: [
        { href: "/admin/employees", label: "Daftar Pegawai",       iconName: "employees" },
        { href: "/admin/sync",      label: "Sinkronisasi Pegawai", iconName: "sync" },
      ],
    }] : []),
    ...(isAdmin ? [{
      group: "Master Data",
      items: [
        { href: "/admin/leave-types",                label: "Jenis Cuti",        iconName: "leaveType" },
        { href: "/admin/units",                      label: "Unit Kerja",        iconName: "unit" },
        { href: "/admin/positions",                  label: "Jabatan",           iconName: "position" },
        { href: "/admin/attendance/shifts",          label: "Shift Kerja",       iconName: "shift" },
        { href: "/admin/attendance/public-holidays", label: "Libur Nasional",    iconName: "holiday" },
        { href: "/admin/attendance/devices",         label: "Perangkat Absensi", iconName: "device" },
      ],
    }] : []),
    {
      group: "Absensi",
      items: [
        ...(isAdmin || isKepalaUnit || isAdminUnit ? [{ href: "/admin/attendance/reports",    label: "Rekap Absensi",  iconName: "attendance" }] : []),
        ...(isAdmin || isKepalaUnit || isAdminUnit ? [{ href: "/admin/attendance/roster",     label: "Roster Pegawai", iconName: "roster",   badge: pendingRoster   || undefined }] : []),
        ...(isAdmin || isKepalaUnit               ? [{ href: "/admin/attendance/overtime",    label: "Lembur Pegawai", iconName: "overtime", badge: pendingOvertime || undefined }] : []),
        ...(isAdmin || isKepalaUnit               ? [{ href: "/admin/attendance/shift-swaps", label: "Tukar Shift",    iconName: "swap",     badge: pendingSwaps    || undefined }] : []),
      ],
    },
    ...(isSuperAdmin ? [{
      group: "Administrasi",
      items: [
        { href: "/admin/users",      label: "Manajemen Pengguna", iconName: "users" },
        { href: "/admin/sessions",   label: "Manajemen Sesi",     iconName: "sessions" },
        { href: "/admin/audit-logs", label: "Audit Log",          iconName: "audit" },
        { href: "/admin/settings",   label: "Pengaturan Sistem",  iconName: "settings" },
      ],
    }] : []),
    ...(process.env.LEGACY_SSO_MOCK === "true" ? [{
      group: "Dev Tools",
      items: [
        { href: "/dev/attendance-qr", label: "QR Absensi (Mock)", iconName: "device" },
      ],
    }] : []),
  ].filter((g) => g.items.length > 0)

  const sidebar = (
    <AdminSidebar
      navGroups={navGroups}
      userName={session.user.name ?? "—"}
      userNip={session.user.nip ?? "—"}
      userInitial={(session.user.name?.charAt(0) ?? "?").toUpperCase()}
      signOutAction={signOutAction}
    />
  )

  return (
    <SidebarLayout sidebar={sidebar} title="CutiSmart — Admin">
      {children}
    </SidebarLayout>
  )
}
