import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import OvertimeClient from "./OvertimeClient"

export const dynamic = "force-dynamic"

export default async function OvertimePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const roles = session.user.roles
  const isKepalaUnit = roles.includes("KEPALA_UNIT")
  const isAdmin = roles.includes("ADMIN_KEPEGAWAIAN") || roles.includes("SUPERADMIN")

  const where: Record<string, unknown> = {}
  if (isKepalaUnit && !isAdmin) {
    const user = await prisma.appUser.findUnique({
      where: { id: session.user.id },
      select: { managedWorkUnitId: true },
    })
    if (user?.managedWorkUnitId) where.workUnitId = user.managedWorkUnitId
    else where.id = "__none__"
  }

  const overtimes = await prisma.overtime.findMany({
    where,
    include: {
      employee: { select: { id: true, fullName: true, nip: true } },
      workUnit: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Lembur Pegawai</h2>
        <p className="text-sm text-gray-500 mt-1">Kelola dan setujui pengajuan lembur pegawai.</p>
      </div>
      <OvertimeClient
        initial={overtimes.map((o) => ({
          id: o.id,
          employee: o.employee,
          workUnit: o.workUnit,
          tanggalKerja: o.tanggalKerja.toISOString().slice(0, 10),
          status: o.status,
          note: o.note,
          createdAt: o.createdAt.toISOString(),
        }))}
        isAdmin={isAdmin}
        isKepalaUnit={isKepalaUnit}
      />
    </div>
  )
}
