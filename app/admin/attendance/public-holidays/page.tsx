import { prisma } from "@/lib/prisma"
import PublicHolidaysClient from "./PublicHolidaysClient"

export const dynamic = "force-dynamic"

export default async function PublicHolidaysPage() {
  const holidays = await prisma.publicHoliday.findMany({
    orderBy: { date: "desc" },
  })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Kalender Libur Nasional</h2>
        <p className="text-sm text-gray-500 mt-1">Kelola hari libur dan cuti bersama nasional. Dipakai untuk perhitungan roster dan rekap absensi.</p>
      </div>
      <PublicHolidaysClient initial={holidays.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), nama: h.nama }))} />
    </div>
  )
}
