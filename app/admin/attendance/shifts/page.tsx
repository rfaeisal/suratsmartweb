import { prisma } from "@/lib/prisma"
import ShiftsClient from "./ShiftsClient"

export const dynamic = "force-dynamic"

export default async function ShiftsPage() {
  const [shifts, units] = await Promise.all([
    prisma.shift.findMany({
      include: {
        shiftUnits: { include: { workUnit: { select: { id: true, name: true } } } },
      },
      orderBy: { nama: "asc" },
    }),
    prisma.workUnit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Master Shift Kerja</h2>
        <p className="text-sm text-gray-500 mt-1">Kelola definisi shift dan penugasan shift ke unit kerja.</p>
      </div>
      <ShiftsClient initial={shifts} units={units} />
    </div>
  )
}
