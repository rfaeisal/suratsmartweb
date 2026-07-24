"use client"

import { useState } from "react"

interface Employee { id: string; fullName: string; nip: string }
interface RosterInfo  { tanggalKerja: string; shift: { nama: string } | null }
interface SwapRecord {
  id: string
  requester: Employee
  target:    Employee
  requesterRoster: RosterInfo
  targetRoster:    RosterInfo
  workUnitName: string
  status: string
  alasan: string | null
  createdAt: string
}

interface Props {
  initial: SwapRecord[]
  isAdmin: boolean
  isKepalaUnit: boolean
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  MENUNGGU_TARGET: { label: "Menunggu Persetujuan Tujuan", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  MENUNGGU_KEPALA: { label: "Menunggu Kepala Unit",        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  DISETUJUI:       { label: "Disetujui",                   color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  DITOLAK:         { label: "Ditolak",                     color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
}

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" })

export default function ShiftSwapsAdminClient({ initial, isAdmin, isKepalaUnit }: Props) {
  const [records, setRecords] = useState<SwapRecord[]>(initial)
  const [filter, setFilter]   = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors,  setErrors]  = useState<Record<string, string>>({})

  async function doAction(id: string, endpoint: "approve" | "reject") {
    setLoading((p) => ({ ...p, [id]: true }))
    setErrors((p) => { const n = { ...p }; delete n[id]; return n })
    try {
      const res = await fetch(`/api/v1/shift-swaps/${id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) { setErrors((p) => ({ ...p, [id]: data.error?.message ?? "Gagal" })); return }
      setRecords((prev) => prev.map((r) => r.id === id ? { ...r, status: data.status } : r))
    } catch { setErrors((p) => ({ ...p, [id]: "Koneksi gagal" })) }
    finally { setLoading((p) => ({ ...p, [id]: false })) }
  }

  const filtered = records.filter((r) => {
    const matchText = !filter ||
      r.requester.fullName.toLowerCase().includes(filter.toLowerCase()) ||
      r.requester.nip.includes(filter) ||
      r.target.fullName.toLowerCase().includes(filter.toLowerCase()) ||
      r.target.nip.includes(filter)
    const matchStatus = !statusFilter || r.status === statusFilter
    return matchText && matchStatus
  })

  const pending = records.filter((r) => r.status === "MENUNGGU_KEPALA").length

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari pegawai atau NIP…"
          className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Semua Status</option>
          <option value="MENUNGGU_TARGET">Menunggu Persetujuan Tujuan</option>
          <option value="MENUNGGU_KEPALA">Menunggu Kepala Unit</option>
          <option value="DISETUJUI">Disetujui</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
        <span className="text-xs text-gray-400 dark:text-slate-500">{filtered.length} permintaan</span>
        {pending > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {pending} menunggu persetujuan
          </span>
        )}
      </div>

      {/* Tabel */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">
            Tidak ada permintaan tukar shift.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400" }
              const canAct = r.status === "MENUNGGU_KEPALA" && (isKepalaUnit || isAdmin)

              return (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Info tukar shift */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.label}
                        </span>
                        {isAdmin && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">{r.workUnitName}</span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          {dateFmt.format(new Date(r.createdAt))}
                        </span>
                      </div>

                      {/* Baris tukar */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div className="bg-gray-50 dark:bg-slate-900 rounded-lg px-3 py-2">
                          <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Pemohon</p>
                          <p className="font-medium text-gray-900 dark:text-slate-100">{r.requester.fullName}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">NIP. {r.requester.nip}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            {dateFmt.format(new Date(r.requesterRoster.tanggalKerja))}
                            {r.requesterRoster.shift && <span className="ml-1 font-medium">{r.requesterRoster.shift.nama}</span>}
                          </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-900 rounded-lg px-3 py-2">
                          <p className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">Tujuan</p>
                          <p className="font-medium text-gray-900 dark:text-slate-100">{r.target.fullName}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">NIP. {r.target.nip}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            {dateFmt.format(new Date(r.targetRoster.tanggalKerja))}
                            {r.targetRoster.shift && <span className="ml-1 font-medium">{r.targetRoster.shift.nama}</span>}
                          </p>
                        </div>
                      </div>

                      {r.alasan && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 italic">"{r.alasan}"</p>
                      )}
                    </div>

                    {/* Aksi */}
                    {canAct && (
                      <div className="shrink-0 flex flex-col gap-2">
                        {errors[r.id] && (
                          <p className="text-xs text-red-600 dark:text-red-400 text-right">{errors[r.id]}</p>
                        )}
                        <button
                          disabled={loading[r.id]}
                          onClick={() => doAction(r.id, "approve")}
                          className="px-4 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {loading[r.id] ? "…" : "Setujui"}
                        </button>
                        <button
                          disabled={loading[r.id]}
                          onClick={() => doAction(r.id, "reject")}
                          className="px-4 py-1.5 text-xs font-medium border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
