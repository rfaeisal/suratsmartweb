"use client"

import { useState } from "react"

interface WorkUnit { id: string; name: string }

interface Props {
  units: WorkUnit[]
  lockedUnitId?: string | null
}

interface AttendanceRow {
  nip: string
  nama: string
  unit: string
  tanggalKerja: string
  shift: string | null
  eventType: string | null
  recordedAt: string | null
  status: "hadir" | "alpha"
  telat: boolean
  flags: string[]
}

const inputClass = "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function AttendanceReportsClient({ units, lockedUnitId }: Props) {
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`
  const todayStr = today.toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(todayStr)
  const [unitId, setUnitId] = useState(lockedUnitId ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [rows, setRows] = useState<AttendanceRow[] | null>(null)

  function buildUrl(format: string) {
    const p = new URLSearchParams({ from, to, format })
    if (unitId) p.set("work_unit_id", unitId)
    return `/api/v1/admin/attendance/reports?${p}`
  }

  async function handleDownload(format: "xlsx" | "pdf") {
    setError("")
    setLoading(true)
    try {
      const res = await fetch(buildUrl(format))
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error?.message ?? "Gagal mengunduh")
        return
      }
      const blob = await res.blob()
      const ext = format === "xlsx" ? "xlsx" : "pdf"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `absensi-${from}-${to}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { setError("Koneksi gagal") }
    finally { setLoading(false) }
  }

  async function handlePreview() {
    setError("")
    setLoading(true)
    setRows(null)
    try {
      const res = await fetch(buildUrl("json"))
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? "Gagal memuat data"); return }
      setRows(data.data)
    } catch { setError("Koneksi gagal") }
    finally { setLoading(false) }
  }

  const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" })
  const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Parameter Laporan</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Dari Tanggal <span className="text-red-500">*</span></label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Sampai Tanggal <span className="text-red-500">*</span></label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Unit Kerja</label>
            {lockedUnitId ? (
              <div className={`${inputClass} w-full bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400`}>
                {units[0]?.name ?? lockedUnitId}
              </div>
            ) : (
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`${inputClass} w-full`}>
                <option value="">— Semua Unit —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button
            onClick={handlePreview}
            disabled={loading}
            className="px-4 py-1.5 text-sm border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "Memuat…" : "Pratinjau"}
          </button>
          <button
            onClick={() => handleDownload("xlsx")}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Unduh Excel (.xlsx)
          </button>
          <button
            onClick={() => handleDownload("pdf")}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            Unduh PDF
          </button>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>

      {rows !== null && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Pratinjau Data</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{rows.length} baris</p>
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">Tidak ada data absensi pada periode ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">NIP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Nama</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Unit</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Tanggal</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Shift</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Jam Masuk</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Ket.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap">{row.nip}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap">{row.nama}</td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 whitespace-nowrap">{row.unit}</td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300 whitespace-nowrap">{dateFmt.format(new Date(row.tanggalKerja))}</td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 whitespace-nowrap">{row.shift ?? "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-slate-300 whitespace-nowrap">
                        {row.recordedAt ? timeFmt.format(new Date(row.recordedAt)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.status === "hadir" ? (row.telat ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300") : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                          {row.status === "hadir" ? (row.telat ? "Hadir Telat" : "Hadir") : "Alpha"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-slate-500">{row.flags.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
