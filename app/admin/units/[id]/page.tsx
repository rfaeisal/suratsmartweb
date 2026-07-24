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
        kepalaRuangan: { select: { id: true, fullName: true, positionTitle: true } },
        adminUnit: { select: { id: true, fullName: true, positionTitle: true } },
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

      {/* Info kepala ruangan + admin unit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">Kepala Unit</p>
          {unit.kepalaRuangan ? (
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
              {unit.kepalaRuangan.fullName}
              {unit.kepalaRuangan.positionTitle && (
                <span className="ml-1 text-xs text-gray-400 dark:text-slate-500 font-normal">— {unit.kepalaRuangan.positionTitle}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-slate-500 italic">Belum ditetapkan</p>
          )}
        </div>
      </div>

      {/* Admin Unit */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div>
          <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">Admin Unit</p>
          {unit.adminUnit ? (
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
              {unit.adminUnit.fullName}
              {unit.adminUnit.positionTitle && (
                <span className="ml-1 text-xs text-gray-400 dark:text-slate-500 font-normal">— {unit.adminUnit.positionTitle}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-slate-500 italic">Belum ditetapkan</p>
          )}
        </div>
      </div>
      </div>

      {/* Sub-unit (jika ada) */}
      {unit.children.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Sub-unit ({unit.children.length})</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {unit.children.map((child) => (
              <div key={child.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50">
                <Link href={`/admin/units/${child.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  {child.name}
                </Link>
                <span className="text-xs text-gray-400 dark:text-slate-500">{child._count.employees} pegawai</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daftar pegawai */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            Pegawai di Unit Ini ({unit.employees.length})
          </h2>
        </div>

        {unit.employees.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
            Belum ada pegawai di unit ini.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Nama / NIP</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Jabatan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Tipe</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {unit.employees.map((emp) => {
                const jabatan = emp.position?.name ?? emp.positionTitle
                return (
                  <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-slate-100">{emp.fullName}</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{emp.nip}</p>
                    </td>
                    <td className="px-4 py-3">
                      {jabatan ? (
                        <div>
                          <p className="text-gray-800 dark:text-slate-200">{jabatan}</p>
                          {emp.position?.level !== undefined && (
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Level {emp.position.level}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-slate-600 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        emp.employeeType === "PNS" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                        emp.employeeType === "PPPK" ? "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                        "bg-amber-50 text-amber-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                      }`}>
                        {emp.employeeType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.isActive ? "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400"
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
