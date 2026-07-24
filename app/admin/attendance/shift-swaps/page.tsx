import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import ShiftSwapsAdminClient from "./ShiftSwapsAdminClient"

export default async function AdminShiftSwapsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const roles = session.user.roles
  const isAdmin     = roles.includes("ADMIN_KEPEGAWAIAN") || roles.includes("SUPERADMIN")
  const isKepalaUnit = roles.includes("KEPALA_UNIT")

  if (!isAdmin && !isKepalaUnit) redirect("/admin/dashboard")

  let whereUnit: Record<string, unknown> = {}
  if (isKepalaUnit && !isAdmin) {
    const appUser = await prisma.appUser.findUnique({
      where: { id: session.user.id },
      select: { managedWorkUnitId: true },
    })
    whereUnit = appUser?.managedWorkUnitId
      ? { workUnitId: appUser.managedWorkUnitId }
      : { id: "__none__" }
  }

  const swaps = await prisma.shiftSwapRequest.findMany({
    where: whereUnit,
    include: {
      requester:     { select: { id: true, fullName: true, nip: true } },
      target:        { select: { id: true, fullName: true, nip: true } },
      requesterRoster: { select: { tanggalKerja: true, shift: { select: { nama: true } } } },
      targetRoster:    { select: { tanggalKerja: true, shift: { select: { nama: true } } } },
      workUnit:      { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  const initial = swaps.map((s) => ({
    id:             s.id,
    requester:      { id: s.requester.id, fullName: s.requester.fullName, nip: s.requester.nip },
    target:         { id: s.target.id, fullName: s.target.fullName, nip: s.target.nip },
    requesterRoster: {
      tanggalKerja: s.requesterRoster.tanggalKerja.toISOString(),
      shift:        s.requesterRoster.shift ? { nama: s.requesterRoster.shift.nama } : null,
    },
    targetRoster: {
      tanggalKerja: s.targetRoster.tanggalKerja.toISOString(),
      shift:        s.targetRoster.shift ? { nama: s.targetRoster.shift.nama } : null,
    },
    workUnitName: s.workUnit.name,
    status:       s.status,
    alasan:       s.alasan,
    createdAt:    s.createdAt.toISOString(),
  }))

  const pending = initial.filter((s) => s.status === "MENUNGGU_KEPALA").length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Tukar Shift</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {isKepalaUnit && !isAdmin
              ? "Permintaan tukar shift dalam unit Anda."
              : "Seluruh permintaan tukar shift pegawai."}
          </p>
        </div>
        {pending > 0 && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {pending} menunggu persetujuan
          </span>
        )}
      </div>

      <ShiftSwapsAdminClient
        initial={initial}
        isAdmin={isAdmin}
        isKepalaUnit={isKepalaUnit}
      />
    </div>
  )
}
