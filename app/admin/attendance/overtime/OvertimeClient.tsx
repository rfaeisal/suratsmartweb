"use client"

import { useState } from "react"

interface Employee { id: string; fullName: string; nip: string }
interface WorkUnit { id: string; name: string }
interface OvertimeRecord {
  id: string
  employee: Employee
  workUnit: WorkUnit
  tanggalKerja: string
  status: string
  note: string | null
  createdAt: string
}

interface Props {
  initial: OvertimeRecord[]
  isAdmin: boolean
  isKepalaUnit: boolean
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DIAJUKAN: { label: "Diajukan", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  DISETUJUI_UNIT: { label: "Disetujui Unit", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  SAH: { label: "Sah", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  DITOLAK: { label: "Ditolak", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
}

export default function OvertimeClient({ initial, isAdmin, isKepalaUnit }: Props) {
  const [records, setRecords] = useState<OvertimeRecord[]>(initial)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function doAction(id: string, endpoint: string) {
    setLoading((p) => ({ ...p, [id]: true }))
    setErrors((p) => { const n = { ...p }; delete n[id]; return n })
    try {
      const res = await fetch(`/api/v1/overtime/${id}/${endpoint}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setErrors((p) => ({ ...p, [id]: data.error?.message ?? "Gagal" })); return }
      setRecords((prev) => prev.map((r) => r.id === id ? { ...r, status: data.status } : r))
    } catch { setErrors((p) => ({ ...p, [id]: "Koneksi gagal" })) }
    finally { setLoading((p) => ({ ...p, [id]: false })) }
  }

  const filtered = records.filter((r) =>
    !filter ||
    r.employee.fullName.toLowerCase().includes(filter.toLowerCase()) ||
    r.employee.nip.includes(filter) ||
    r.workUnit.name.toLowerCase().includes(filter.toLowerCase())
  )

  const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari pegawai atau unit…"
          className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        <span className="text-xs text-gray-400 dark:text-slate-500">{filtered.length} pengajuan</span>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">Tidak ada pengajuan lembur.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Pegawai</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Tanggal Kerja</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filtered.map((r) => {
                const st = STATUS_LABEL[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400" }
                return (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-slate-100">{r.employee.fullName}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">NIP. {r.employee.nip}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{r.workUnit.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{dateFmt.format(new Date(r.tanggalKerja))}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {errors[r.id] && <span className="text-xs text-red-600 dark:text-red-400">{errors[r.id]}</span>}
                        {r.status === "DIAJUKAN" && isKepalaUnit && (
                          <button
                            disabled={loading[r.id]}
                            onClick={() => doAction(r.id, "approve-unit")}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            {loading[r.id] ? "…" : "Setujui (Unit)"}
                          </button>
                        )}
                        {r.status === "DISETUJUI_UNIT" && isAdmin && (
                          <button
                            disabled={loading[r.id]}
                            onClick={() => doAction(r.id, "approve-hr")}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {loading[r.id] ? "…" : "Sahkan (HR)"}
                          </button>
                        )}
                        {(r.status === "DIAJUKAN" || r.status === "DISETUJUI_UNIT") && (isKepalaUnit || isAdmin) && (
                          <button
                            disabled={loading[r.id]}
                            onClick={() => doAction(r.id, "reject")}
                            className="px-3 py-1 text-xs text-red-600 border border-red-100 rounded-lg hover:bg-red-50 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                        )}
                      </div>
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
