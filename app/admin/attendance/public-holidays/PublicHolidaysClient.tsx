"use client"

import { useState } from "react"

interface Holiday {
  id: string
  date: string
  nama: string
}

interface Props {
  initial: Holiday[]
}

const inputClass = "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function PublicHolidaysClient({ initial }: Props) {
  const [holidays, setHolidays] = useState<Holiday[]>(initial)
  const [newDate, setNewDate] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())

  const years = Array.from(new Set(holidays.map((h) => new Date(h.date).getFullYear()))).sort((a, b) => b - a)
  if (!years.includes(filterYear)) years.unshift(filterYear)

  const filtered = holidays.filter((h) => new Date(h.date).getFullYear() === filterYear).sort((a, b) => a.date.localeCompare(b.date))

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError("")
    if (!newDate) { setAddError("Tanggal wajib dipilih"); return }
    if (!newDesc.trim()) { setAddError("Keterangan wajib diisi"); return }
    setAdding(true)
    try {
      const res = await fetch("/api/v1/public-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, nama: newDesc.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error?.message ?? "Gagal menyimpan"); return }
      setHolidays((prev) => [...prev, data])
      setFilterYear(new Date(newDate).getFullYear())
      setNewDate("")
      setNewDesc("")
    } catch { setAddError("Koneksi gagal") }
    finally { setAdding(false) }
  }

  async function handleDelete(id: string, desc: string) {
    if (!confirm(`Hapus hari libur "${desc}"?`)) return
    const res = await fetch(`/api/v1/public-holidays/${id}`, { method: "DELETE" })
    if (res.ok) setHolidays((prev) => prev.filter((h) => h.id !== id))
  }

  const monthFmt = new Intl.DateTimeFormat("id-ID", { month: "long" })
  const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })

  function groupByMonth(list: Holiday[]) {
    const map = new Map<number, Holiday[]>()
    for (const h of list) {
      const m = new Date(h.date).getMonth()
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(h)
    }
    return map
  }

  const grouped = groupByMonth(filtered)

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Tambah Hari Libur</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Tanggal <span className="text-red-500">*</span></label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Keterangan <span className="text-red-500">*</span></label>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="misal: Hari Raya Idul Fitri" className={`${inputClass} w-full`} />
          </div>
          <button type="submit" disabled={adding} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {adding ? "Menyimpan…" : "Tambah"}
          </button>
          {addError && <p className="text-xs text-red-600 dark:text-red-400 w-full">{addError}</p>}
        </form>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3">
          <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Tahun:</label>
          <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className={inputClass}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-xs text-gray-400 dark:text-slate-500">{filtered.length} hari libur</span>
        </div>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">Belum ada hari libur untuk tahun {filterYear}.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {Array.from(grouped.entries()).map(([month, items]) => (
              <div key={month}>
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-700">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">{monthFmt.format(new Date(filterYear, month))}</span>
                </div>
                {items.map((h) => (
                  <div key={h.id} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{h.nama}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">{dateFmt.format(new Date(h.date))}</p>
                    </div>
                    <button onClick={() => handleDelete(h.id, h.nama)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Hapus</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
