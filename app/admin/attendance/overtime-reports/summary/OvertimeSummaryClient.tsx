"use client"

import { useState } from "react"
import {
  formatDurasi,
  type OvertimeReportSummary,
  type OvertimeSummaryRow,
} from "@/lib/reports/overtime-types"

interface WorkUnit { id: string; name: string }

interface Props {
  units: WorkUnit[]
  lockedUnitId?: string | null
}

const inputClass =
  "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
type FilterMode = "range" | "monthly"
type SortKey = "nama" | "jumlahPengajuan" | "jumlahSah" | "jumlahMenunggu" | "jumlahDitolak" | "totalDurasiMenit"

export default function OvertimeSummaryClient({ units, lockedUnitId }: Props) {
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`
  const todayStr = today.toISOString().slice(0, 10)

  const [mode, setMode] = useState<FilterMode>("monthly")
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(todayStr)
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [unitId, setUnitId] = useState(lockedUnitId ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [rows, setRows] = useState<OvertimeSummaryRow[] | null>(null)
  const [summary, setSummary] = useState<OvertimeReportSummary | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("nama")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  function currentRange(): { from: string; to: string } {
    if (mode === "range") return { from, to }
    const first = `${year}-${String(month).padStart(2, "0")}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    return { from: first, to: last }
  }

  function buildUrl(format: string) {
    const { from: f, to: t } = currentRange()
    const p = new URLSearchParams({ view: "summary", from: f, to: t, format })
    if (unitId) p.set("work_unit_id", unitId)
    return `/api/v1/admin/overtime-reports?${p}`
  }

  async function handlePreview() {
    setError("")
    setLoading(true)
    setRows(null)
    setSummary(null)
    try {
      const res = await fetch(buildUrl("json"))
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? "Gagal memuat"); return }
      setRows(data.data)
      setSummary(data.summary)
    } catch { setError("Koneksi gagal") }
    finally { setLoading(false) }
  }

  async function handleDownload(fmt: "xlsx" | "pdf") {
    setError("")
    setLoading(true)
    try {
      const res = await fetch(buildUrl(fmt))
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error?.message ?? "Gagal mengunduh")
        return
      }
      const blob = await res.blob()
      const { from: f, to: t } = currentRange()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `lembur-ringkasan-${f}-${t}.${fmt}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { setError("Koneksi gagal") }
    finally { setLoading(false) }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const sortedRows = rows === null ? null : [...rows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1
    if (sortKey === "nama") return a.nama.localeCompare(b.nama) * dir
    return ((a[sortKey] as number) - (b[sortKey] as number)) * dir
  })

  const yearOptions: number[] = []
  for (let y = today.getFullYear() - 3; y <= today.getFullYear() + 1; y++) yearOptions.push(y)

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setMode("range")} className={`px-3 py-1 text-xs rounded-lg font-medium ${mode === "range" ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400"}`}>Rentang Tanggal</button>
          <button onClick={() => setMode("monthly")} className={`px-3 py-1 text-xs rounded-lg font-medium ${mode === "monthly" ? "bg-blue-600 text-white" : "border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400"}`}>Bulanan</button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {mode === "range" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Dari</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Sampai</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Bulan</label>
                <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))} className={inputClass}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Tahun</label>
                <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className={inputClass}>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Unit Kerja</label>
            {lockedUnitId ? (
              <div className={`${inputClass} w-full bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400`}>{units[0]?.name ?? lockedUnitId}</div>
            ) : (
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`${inputClass} w-full`}>
                <option value="">— Semua unit —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={handlePreview} disabled={loading} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? "Memuat…" : "Muat Data"}</button>
          <button onClick={() => handleDownload("xlsx")} disabled={loading} className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Unduh Excel</button>
          <button onClick={() => handleDownload("pdf")} disabled={loading} className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Unduh PDF</button>
          {error && <p className="text-xs text-red-600 dark:text-red-400 self-center">{error}</p>}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card label="Total Pegawai" value={String(sortedRows?.length ?? 0)} />
          <Card label="Pengajuan" value={String(summary.totalPengajuan)} />
          <Card label="SAH" value={String(summary.totalSah)} accent="success" />
          <Card label="Menunggu" value={String(summary.totalMenunggu)} accent="warning" />
          <Card label="Total Durasi" value={formatDurasi(summary.totalDurasiMenit)} />
        </div>
      )}

      {sortedRows !== null && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Ringkasan per Pegawai</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{sortedRows.length} pegawai · klik header kolom untuk urut</p>
          </div>
          {sortedRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400 dark:text-slate-500">Tidak ada data pada periode ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">NIP</th>
                    <SortableTh label="Nama" active={sortKey === "nama"} dir={sortDir} onClick={() => toggleSort("nama")} align="left" />
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Unit</th>
                    <SortableTh label="Pengajuan" active={sortKey === "jumlahPengajuan"} dir={sortDir} onClick={() => toggleSort("jumlahPengajuan")} align="right" />
                    <SortableTh label="SAH" active={sortKey === "jumlahSah"} dir={sortDir} onClick={() => toggleSort("jumlahSah")} align="right" />
                    <SortableTh label="Menunggu" active={sortKey === "jumlahMenunggu"} dir={sortDir} onClick={() => toggleSort("jumlahMenunggu")} align="right" />
                    <SortableTh label="Ditolak" active={sortKey === "jumlahDitolak"} dir={sortDir} onClick={() => toggleSort("jumlahDitolak")} align="right" />
                    <SortableTh label="Total Durasi" active={sortKey === "totalDurasiMenit"} dir={sortDir} onClick={() => toggleSort("totalDurasiMenit")} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {sortedRows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap">{r.nip}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap">{r.nama}</td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400 whitespace-nowrap">{r.unit}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 dark:text-slate-300 whitespace-nowrap">{r.jumlahPengajuan}</td>
                      <td className="px-4 py-2.5 text-right text-green-600 dark:text-green-400 whitespace-nowrap font-medium">{r.jumlahSah}</td>
                      <td className="px-4 py-2.5 text-right text-yellow-600 dark:text-yellow-400 whitespace-nowrap font-medium">{r.jumlahMenunggu}</td>
                      <td className="px-4 py-2.5 text-right text-red-600 dark:text-red-400 whitespace-nowrap font-medium">{r.jumlahDitolak}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700 dark:text-slate-300 whitespace-nowrap">{formatDurasi(r.totalDurasiMenit)}</td>
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

function Card({ label, value, accent }: { label: string; value: string; accent?: "warning" | "danger" | "success" }) {
  const cls =
    accent === "warning" ? "text-yellow-600 dark:text-yellow-400"
    : accent === "danger" ? "text-red-600 dark:text-red-400"
    : accent === "success" ? "text-green-600 dark:text-green-400"
    : "text-gray-900 dark:text-slate-100"
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${cls}`}>{value}</p>
    </div>
  )
}

function SortableTh({ label, active, dir, onClick, align }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; align: "left" | "right" }) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-700 dark:hover:text-slate-200 text-${align}`}
    >
      {label}
      {active && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  )
}
