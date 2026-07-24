import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import RosterClient from "./RosterClient"
import type { AppRole } from "@prisma/client"

export const dynamic = "force-dynamic"

type RosterUserRole = "ADMIN_KEPEGAWAIAN" | "SUPERADMIN" | "KEPALA_UNIT" | "ADMIN_UNIT"

export default async function RosterPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const roles = session.user.roles as AppRole[]
  const isSuperAdmin = roles.includes("SUPERADMIN")
  const isAdmin = roles.includes("ADMIN_KEPEGAWAIAN") || isSuperAdmin
  const isKepalaUnit = roles.includes("KEPALA_UNIT")
  const isAdminUnit = roles.includes("ADMIN_UNIT")

  let userRole: RosterUserRole
  if (isSuperAdmin) userRole = "SUPERADMIN"
  else if (isAdmin) userRole = "ADMIN_KEPEGAWAIAN"
  else if (isKepalaUnit) userRole = "KEPALA_UNIT"
  else if (isAdminUnit) userRole = "ADMIN_UNIT"
  else redirect("/login")

  let units: { id: string; name: string }[]
  let lockedUnitId: string | null = null

  if (isAdmin) {
    units = await prisma.workUnit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
  } else {
    const appUser = await prisma.appUser.findUnique({
      where: { id: session.user.id },
      select: { managedWorkUnitId: true },
    })
    if (!appUser?.managedWorkUnitId) {
      return (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">
          Akun Anda belum dikaitkan dengan unit kerja. Hubungi administrator.
        </div>
      )
    }
    lockedUnitId = appUser.managedWorkUnitId
    const unit = await prisma.workUnit.findUnique({
      where: { id: lockedUnitId },
      select: { id: true, name: true },
    })
    units = unit ? [unit] : []
  }

  const rawShifts = await prisma.shift.findMany({
    where: { active: true },
    orderBy: { nama: "asc" },
    select: {
      id: true, nama: true, type: true, startTime: true, endTime: true,
      shiftUnits: { select: { workUnitId: true } },
    },
  })
  const shifts = rawShifts.map((s) => ({
    id: s.id, nama: s.nama, type: s.type, startTime: s.startTime, endTime: s.endTime,
    workUnitIds: s.shiftUnits.map((su) => su.workUnitId),
  }))

  return <RosterClient units={units} shifts={shifts} lockedUnitId={lockedUnitId} userRole={userRole} />
}
