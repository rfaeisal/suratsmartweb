import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import OvertimeDetailClient from "./OvertimeDetailClient"

export const dynamic = "force-dynamic"

export default async function OvertimeDetailPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const roles = session.user.roles ?? []
  const isAdmin = roles.includes("ADMIN_KEPEGAWAIAN") || roles.includes("SUPERADMIN")
  const isUnitRole = roles.includes("KEPALA_UNIT") || roles.includes("ADMIN_UNIT")
  if (!isAdmin && !isUnitRole) redirect("/login")

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
      return <div className="p-8 text-center text-sm text-gray-500">Akun Anda belum dikaitkan dengan unit kerja.</div>
    }
    lockedUnitId = appUser.managedWorkUnitId
    const unit = await prisma.workUnit.findUnique({ where: { id: lockedUnitId }, select: { id: true, name: true } })
    units = unit ? [unit] : []
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Laporan Lembur — Detail</h2>
        <p className="text-sm text-gray-500 mt-1">Detail per pengajuan lembur dengan jam masuk, jam pulang, dan durasi.</p>
      </div>
      <OvertimeDetailClient units={units} lockedUnitId={lockedUnitId} />
    </div>
  )
}
