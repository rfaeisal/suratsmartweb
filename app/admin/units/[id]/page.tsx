import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { notFound } from "next/navigation"
import UnitDetailActions from "./UnitDetailActions"

type Props = { params: Promise<{ id: string }> }

export default async function UnitDetailPage({ params }: Props) {
  const { id } = await params

  const [unit, allUnits] = await Promise.all([
    prisma.workUnit.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          select: { id: true, name: true, _count: { select: { employees: true } } },
          orderBy: { name: "asc" },
        },
        employees: {
          include: { position: { select: { name: true, level: true } } },
          orderBy: { fullName: "asc" },
        },
        _count: { select: { employees: true, children: true } },
      },
    }),
    prisma.workUnit.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])

  if (!unit) notFound()

  return (
    <div className="space-y-6">
      {/* Header dengan tombol edit & hapus */}
      <UnitDetailActions unit={unit} allUnits={allUnits} />

      {/* Sub-unit (jika ada) */}
      {unit.children.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Sub-unit ({unit.children.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {unit.children.map((child) => (
              <div key={child.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                <Link href={`/admin/units/${child.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  {child.name}
                </Link>
                <span className="text-xs text-gray-400">{child._count.employees} pegawai</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daftar pegawai */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">
            Pegawai di Unit Ini ({unit.employees.length})
          </h2>
        </div>

        {unit.employees.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            Belum ada pegawai di unit ini.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama / NIP</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jabatan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipe</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unit.employees.map((emp) => {
                const jabatan = emp.position?.name ?? emp.positionTitle
                return (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{emp.fullName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{emp.nip}</p>
                    </td>
                    <td className="px-4 py-3">
                      {jabatan ? (
                        <div>
                          <p className="text-gray-800">{jabatan}</p>
                          {emp.position?.level !== undefined && (
                            <p className="text-xs text-gray-400 mt-0.5">Level {emp.position.level}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        emp.employeeType === "PNS" ? "bg-blue-50 text-blue-700" :
                        emp.employeeType === "PPPK" ? "bg-green-50 text-green-700" :
                        "bg-amber-50 text-amber-700"
                      }`}>
                        {emp.employeeType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {emp.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
