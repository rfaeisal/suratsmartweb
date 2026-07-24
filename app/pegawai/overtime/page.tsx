"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

const STATUS_LABEL: Record<string, string> = {
  DIAJUKAN:      "Menunggu Persetujuan Unit",
  DISETUJUI_UNIT: "Disetujui Unit — Menunggu HR",
  SAH:           "Sah",
  DITOLAK:       "Ditolak",
}

const STATUS_COLOR: Record<string, string> = {
  DIAJUKAN:      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  DISETUJUI_UNIT: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  SAH:           "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  DITOLAK:       "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

async function submitOvertime(employeeId: string, unitId: string, formData: FormData) {
  "use server"
  const tanggal = (formData.get("tanggal_kerja") as string)?.trim()
  const note    = (formData.get("note") as string)?.trim() || undefined
  if (!tanggal) return

  await prisma.overtime.create({
    data: {
      employeeId,
      workUnitId: unitId,
      tanggalKerja: new Date(tanggal + "T00:00:00Z"),
      note,
    },
  })
  revalidatePath("/pegawai/overtime")
}

export default async function OvertimePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const empId = session.user.employeeId

  const employee = await prisma.employee.findUnique({
    where: { id: empId },
    select: { unitId: true },
  })
  if (!employee?.unitId) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        Akun Anda belum dikaitkan dengan unit kerja. Hubungi administrator.
      </div>
    )
  }

  const overtimes = await prisma.overtime.findMany({
    where: { employeeId: empId },
    orderBy: { tanggalKerja: "desc" },
  })

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Pengajuan Lembur</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          Ajukan lembur dan pantau status persetujuannya.
        </p>
      </div>

      {/* Form pengajuan */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200 mb-4">Ajukan Lembur Baru</h3>
        <form action={submitOvertime.bind(null, empId, employee.unitId)} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Tanggal Lembur</label>
            <input
              type="date"
              name="tanggal_kerja"
              defaultValue={today}
              required
              className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Catatan (opsional)</label>
            <input
              type="text"
              name="note"
              placeholder="Keterangan pekerjaan lembur..."
              maxLength={500}
              className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ajukan
          </button>
        </form>
      </div>

      {/* Daftar pengajuan */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
        {overtimes.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">
            Belum ada pengajuan lembur.
          </p>
        ) : (
          overtimes.map((ot) => (
            <div key={ot.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                  {new Date(ot.tanggalKerja).toLocaleDateString("id-ID", {
                    weekday: "long", day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
                {ot.note && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{ot.note}</p>
                )}
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                  Diajukan {new Date(ot.createdAt).toLocaleDateString("id-ID", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </p>
              </div>
              <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[ot.status]}`}>
                {STATUS_LABEL[ot.status] ?? ot.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
