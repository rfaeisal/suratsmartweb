import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import type { EmployeeType } from "@prisma/client"

async function createLeaveType(formData: FormData) {
  "use server"
  const code = (formData.get("code") as string).toUpperCase().trim()
  const name = formData.get("name") as string
  const requiresAttachment = formData.get("requiresAttachment") === "on"
  const defaultQuotaDays = formData.get("defaultQuotaDays")
    ? parseInt(formData.get("defaultQuotaDays") as string)
    : null
  const applicableTo = formData.getAll("applicableTo") as EmployeeType[]

  if (!code || !name || applicableTo.length === 0) return

  try {
    await prisma.leaveType.create({
      data: { code, name, requiresAttachment, defaultQuotaDays, applicableTo, isActive: true },
    })
  } catch {
    // unique constraint atau error lainnya
  }
  revalidatePath("/admin/leave-types")
}

async function toggleLeaveType(id: string, isActive: boolean) {
  "use server"
  await prisma.leaveType.update({ where: { id }, data: { isActive } })
  revalidatePath("/admin/leave-types")
}

export default async function LeaveTypesPage() {
  const leaveTypes = await prisma.leaveType.findMany({ orderBy: { name: "asc" } })

  const employeeTypes: EmployeeType[] = ["PNS", "PPPK", "BLUD"]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Jenis Cuti</h2>
          <p className="text-sm text-gray-500 mt-1">Kelola master data jenis cuti dan aturannya</p>
        </div>
      </div>

      {/* Form tambah jenis cuti */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-medium text-gray-900 mb-4">Tambah Jenis Cuti Baru</h3>
        <form action={createLeaveType} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kode <span className="text-red-500">*</span>
              </label>
              <input
                name="code"
                required
                placeholder="misal: CUTI_TAHUNAN"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nama <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                required
                placeholder="misal: Cuti Tahunan"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Berlaku untuk <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              {employeeTypes.map((et) => (
                <label key={et} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="applicableTo" value={et} className="rounded" />
                  <span className="text-sm text-gray-700">{et}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kuota Default (hari/tahun)
              </label>
              <input
                name="defaultQuotaDays"
                type="number"
                min="1"
                placeholder="Kosongkan jika tidak berbasis kuota"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input type="checkbox" name="requiresAttachment" className="rounded" />
                <span className="text-sm text-gray-700">Wajib lampiran</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Simpan
            </button>
          </div>
        </form>
      </div>

      {/* Tabel jenis cuti */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Kode</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Nama</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Berlaku untuk</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Kuota (hari)</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Lampiran</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leaveTypes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Belum ada jenis cuti. Tambahkan di atas.
                </td>
              </tr>
            )}
            {leaveTypes.map((lt) => (
              <tr key={lt.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{lt.code}</td>
                <td className="px-4 py-3 text-gray-900">{lt.name}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {lt.applicableTo.map((et) => (
                      <span
                        key={et}
                        className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700"
                      >
                        {et}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lt.defaultQuotaDays ?? <span className="text-gray-400">–</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lt.requiresAttachment ? "Wajib" : "Opsional"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      lt.isActive
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {lt.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form
                    action={toggleLeaveType.bind(null, lt.id, !lt.isActive)}
                  >
                    <button
                      type="submit"
                      className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                        lt.isActive
                          ? "text-red-600 hover:bg-red-50"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {lt.isActive ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
