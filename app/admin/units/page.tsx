import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

async function createUnit(formData: FormData) {
  "use server"
  const name = (formData.get("name") as string)?.trim()
  const parentId = (formData.get("parentId") as string) || null

  if (!name) return

  await prisma.workUnit.create({ data: { name, parentId } })
  revalidatePath("/admin/units")
}

export default async function UnitsPage() {
  const units = await prisma.workUnit.findMany({
    include: {
      parent: { select: { name: true } },
      _count: { select: { employees: true } },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Unit Kerja</h2>
        <p className="text-sm text-gray-500 mt-1">Kelola hierarki unit kerja instansi</p>
      </div>

      {/* Form tambah unit */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-medium text-gray-900 mb-4">Tambah Unit Kerja Baru</h3>
        <form action={createUnit} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Unit <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              required
              placeholder="misal: Bagian Umum"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unit Induk (opsional)
            </label>
            <select
              name="parentId"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Tidak ada (root) —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Simpan
          </button>
        </form>
      </div>

      {/* Tabel unit kerja */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Nama Unit</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Unit Induk</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Jumlah Pegawai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {units.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  Belum ada unit kerja. Tambahkan di atas.
                </td>
              </tr>
            )}
            {units.map((unit) => (
              <tr key={unit.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-medium">{unit.name}</td>
                <td className="px-4 py-3 text-gray-500">
                  {unit.parent?.name ?? <span className="text-gray-400 italic">Root</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{unit._count.employees}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
