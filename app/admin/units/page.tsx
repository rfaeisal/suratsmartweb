import { prisma } from "@/lib/prisma"
import UnitsClient from "./UnitsClient"

export default async function UnitsPage() {
  const units = await prisma.workUnit.findMany({
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { employees: true } },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Master Unit Kerja</h2>
        <p className="text-sm text-gray-500 mt-1">Kelola hierarki unit kerja instansi. Klik nama unit untuk melihat daftar pegawainya.</p>
      </div>
      <UnitsClient initial={units} />
    </div>
  )
}
