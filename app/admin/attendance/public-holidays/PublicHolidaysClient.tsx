"use client"

import { useState } from "react"

type Jenis = "NASIONAL" | "CUTI_BERSAMA"

interface Holiday {
  id: string
  date: string
  nama: string
  jenis: Jenis
}

interface Props {
  initial: Holiday[]
}

interface SyncItem {
  date: string
  nama: string
  jenis: Jenis
  checked: boolean
}

const inputClass =
  "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

const jenisLabel: Record<Jenis, string> = {
  NASIONAL: "Libur Nasional",
  CUTI_BERSAMA: "Cuti Bersama",
}

const jenisBadge: Record<Jenis, string> = {
  NASIONAL: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  CUTI_BERSAMA: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
}

export default function PublicHolidaysClient({ initial }: Props) {
  const [holidays, setHolidays] = useState<Holiday[]>(initial)
  const [newDate, setNewDate] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [newJenis, setNewJenis] = useState<Jenis>("NASIONAL")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())

  const [editId, setEditId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editJenis, setEditJenis] = useState<Jenis>("NASIONAL")
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  const [syncOpen, setSyncOpen] = useState(false)
  const [syncYear, setSyncYear] = useState(new Date().getFullYear())
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState("")
  const [syncItems, setSyncItems] = useState<SyncItem[]>([])
  const [syncPreviewed, setSyncPreviewed] = useState(false)
  const [syncImporting, setSyncImporting] = useState(false)

  const years = Array.from(new Set(holidays.map((h) => new Date(h.date).getFullYear()))).sort((a, b) => b - a)
  if (!years.includes(filterYear)) years.unshift(filterYear)

  const filtered = holidays
    .filter((h) => new Date(h.date).getFullYear() === filterYear)
    .sort((a, b) => a.date.localeCompare(b.date))

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError("")
    if (!newDate) {
      setAddError("Tanggal wajib dipilih")
      return
    }
    if (!newDesc.trim()) {
      setAddError("Keterangan wajib diisi")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/v1/public-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, nama: newDesc.trim(), jenis: newJenis }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error?.message ?? "Gagal menyimpan")
        return
      }
      setHolidays((prev) => [...prev, data])
      setFilterYear(new Date(newDate).getFullYear())
      setNewDate("")
      setNewDesc("")
      setNewJenis("NASIONAL")
    } catch {
      setAddError("Koneksi gagal")
    } finally {
      setAdding(false)
    }
  }

  function startEdit(h: Holiday) {
    setEditId(h.id)
    setEditDate(h.date)
    setEditDesc(h.nama)
    setEditJenis(h.jenis)
    setEditError("")
  }

  function cancelEdit() {
    setEditId(null)
    setEditError("")
  }

  async function handleSaveEdit() {
    if (!editId) return
    setEditError("")
    if (!editDate) {
      setEditError("Tanggal wajib dipilih")
      return
    }
    if (!editDesc.trim()) {
      setEditError("Keterangan wajib diisi")
      return
    }
    setEditSaving(true)
    try {
      const res = await fetch(`/api/v1/public-holidays/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: editDate, nama: editDesc.trim(), jenis: editJenis }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error?.message ?? "Gagal menyimpan")
        return
      }
      setHolidays((prev) => prev.map((h) => (h.id === editId ? data : h)))
      setEditId(null)
    } catch {
      setEditError("Koneksi gagal")
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string, desc: string) {
    if (!confirm(`Hapus hari libur "${desc}"?`)) return
    const res = await fetch(`/api/v1/public-holidays/${id}`, { method: "DELETE" })
    if (res.ok) setHolidays((prev) => prev.filter((h) => h.id !== id))
  }

  function openSync() {
    setSyncOpen(true)
    setSyncYear(new Date().getFullYear())
    setSyncItems([])
    setSyncPreviewed(false)
    setSyncError("")
  }

  function closeSync() {
    if (syncImporting) return
    setSyncOpen(false)
  }

  async function handlePreview() {
    setSyncError("")
    setSyncPreviewed(false)
    setSyncLoading(true)
    try {
      const res = await fetch(`/api/v1/public-holidays/sync?year=${syncYear}`)
      const data = await res.json()
      if (!res.ok) {
        setSyncError(data.error?.message ?? "Gagal mengambil data")
        setSyncItems([])
        return
      }
      const items: SyncItem[] = (data.items as { date: string; nama: string; jenis: Jenis }[]).map((i) => ({
        ...i,
        checked: false,
      }))
      setSyncItems(items)
      setSyncPreviewed(true)
    } catch {
      setSyncError("Koneksi gagal")
      setSyncItems([])
    } finally {
      setSyncLoading(false)
    }
  }

  function toggleAll(check: boolean) {
    setSyncItems((prev) => prev.map((i) => ({ ...i, checked: check })))
  }

  function toggleOne(idx: number) {
    setSyncItems((prev) => prev.map((i, k) => (k === idx ? { ...i, checked: !i.checked } : i)))
  }

  async function handleImport() {
    const selected = syncItems.filter((i) => i.checked)
    if (selected.length === 0) {
      setSyncError("Centang minimal satu tanggal")
      return
    }
    setSyncError("")
    setSyncImporting(true)
    try {
      const res = await fetch(`/api/v1/public-holidays/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map((i) => ({ date: i.date, nama: i.nama, jenis: i.jenis })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSyncError(data.error?.message ?? "Gagal mengimpor")
        return
      }
      const listRes = await fetch(`/api/v1/public-holidays?year=${syncYear}`)
      if (listRes.ok) {
        const listData = await listRes.json()
        const yearHolidays: Holiday[] = listData.data
        setHolidays((prev) => {
          const others = prev.filter((h) => new Date(h.date).getFullYear() !== syncYear)
          return [...others, ...yearHolidays]
        })
        setFilterYear(syncYear)
      }
      setSyncOpen(false)
      alert(`Berhasil impor ${data.inserted} hari libur${data.skipped ? ` (${data.skipped} dilewati)` : ""}.`)
    } catch {
      setSyncError("Koneksi gagal")
    } finally {
      setSyncImporting(false)
    }
  }

  const monthFmt = new Intl.DateTimeFormat("id-ID", { month: "long" })
  const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })
  const previewDateFmt = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })

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
  const selectedCount = syncItems.filter((i) => i.checked).length
  const allChecked = syncItems.length > 0 && selectedCount === syncItems.length

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Tambah Hari Libur</h3>
          <button
            type="button"
            onClick={openSync}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700"
          >
            Sync dari libur.deno.dev
          </button>
        </div>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Tanggal <span className="text-red-500">*</span>
            </label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Keterangan <span className="text-red-500">*</span>
            </label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="misal: Hari Raya Idul Fitri"
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Jenis</label>
            <select value={newJenis} onChange={(e) => setNewJenis(e.target.value as Jenis)} className={inputClass}>
              <option value="NASIONAL">Libur Nasional</option>
              <option value="CUTI_BERSAMA">Cuti Bersama</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? "Menyimpan…" : "Tambah"}
          </button>
          {addError && <p className="text-xs text-red-600 dark:text-red-400 w-full">{addError}</p>}
        </form>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3">
          <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Tahun:</label>
          <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className={inputClass}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400 dark:text-slate-500">{filtered.length} hari libur</span>
        </div>
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">
            Belum ada hari libur untuk tahun {filterYear}.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {Array.from(grouped.entries()).map(([month, items]) => (
              <div key={month}>
                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-700">
                  <span className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                    {monthFmt.format(new Date(filterYear, month))}
                  </span>
                </div>
                {items.map((h) =>
                  editId === h.id ? (
                    <div key={h.id} className="px-4 py-3 bg-blue-50 dark:bg-slate-700/40">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Tanggal</label>
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div className="flex-1 min-w-48">
                          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Keterangan</label>
                          <input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className={`${inputClass} w-full`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Jenis</label>
                          <select
                            value={editJenis}
                            onChange={(e) => setEditJenis(e.target.value as Jenis)}
                            className={inputClass}
                          >
                            <option value="NASIONAL">Libur Nasional</option>
                            <option value="CUTI_BERSAMA">Cuti Bersama</option>
                          </select>
                        </div>
                        <button
                          onClick={handleSaveEdit}
                          disabled={editSaving}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {editSaving ? "Menyimpan…" : "Simpan"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={editSaving}
                          className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                        >
                          Batal
                        </button>
                      </div>
                      {editError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{editError}</p>}
                    </div>
                  ) : (
                    <div key={h.id} className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{h.nama}</p>
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${jenisBadge[h.jenis]}`}>
                            {jenisLabel[h.jenis]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{dateFmt.format(new Date(h.date))}</p>
                      </div>
                      <button
                        onClick={() => startEdit(h)}
                        className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-slate-700 mr-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(h.id, h.nama)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-slate-700"
                      >
                        Hapus
                      </button>
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {syncOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeSync}>
          <div
            className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Sync Hari Libur dari libur.deno.dev</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  Hanya menampilkan tanggal yang belum ada di database.
                </p>
              </div>
              <button
                onClick={closeSync}
                disabled={syncImporting}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 text-lg leading-none disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Tahun</label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={syncYear}
                  onChange={(e) => setSyncYear(Number(e.target.value))}
                  className={`${inputClass} w-28`}
                />
              </div>
              <button
                onClick={handlePreview}
                disabled={syncLoading || syncImporting}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {syncLoading ? "Memuat…" : "Preview"}
              </button>
              {syncPreviewed && syncItems.length > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => toggleAll(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    Centang semua
                  </button>
                  <span className="text-gray-300 dark:text-slate-600">|</span>
                  <button
                    onClick={() => toggleAll(false)}
                    className="text-xs text-gray-600 hover:text-gray-800 dark:text-slate-300"
                  >
                    Uncheck semua
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {syncError && (
                <div className="mx-5 mt-3 px-3 py-2 rounded bg-red-50 dark:bg-red-900/30 text-xs text-red-700 dark:text-red-300">
                  {syncError}
                </div>
              )}
              {!syncPreviewed && !syncLoading && (
                <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">
                  Pilih tahun lalu klik <b>Preview</b> untuk melihat data yang bisa di-import.
                </p>
              )}
              {syncPreviewed && syncItems.length === 0 && (
                <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">
                  Semua hari libur tahun {syncYear} sudah ada di database.
                </p>
              )}
              {syncPreviewed && syncItems.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-700 sticky top-0">
                    <tr className="text-left text-xs text-gray-500 dark:text-slate-400">
                      <th className="px-4 py-2 w-10">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={(e) => toggleAll(e.target.checked)}
                          aria-label="Centang semua"
                        />
                      </th>
                      <th className="px-4 py-2">Tanggal</th>
                      <th className="px-4 py-2">Keterangan</th>
                      <th className="px-4 py-2">Jenis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {syncItems.map((item, idx) => (
                      <tr
                        key={item.date}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                        onClick={() => toggleOne(idx)}
                      >
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => toggleOne(idx)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Pilih ${item.nama}`}
                          />
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-slate-100">
                          {previewDateFmt.format(new Date(item.date))}
                        </td>
                        <td className="px-4 py-2 text-gray-700 dark:text-slate-200">{item.nama}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${jenisBadge[item.jenis]}`}>
                            {jenisLabel[item.jenis]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {syncPreviewed ? `${selectedCount} dari ${syncItems.length} dipilih` : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeSync}
                  disabled={syncImporting}
                  className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  Tutup
                </button>
                <button
                  onClick={handleImport}
                  disabled={!syncPreviewed || selectedCount === 0 || syncImporting}
                  className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {syncImporting ? "Mengimpor…" : `Import Terpilih${selectedCount ? ` (${selectedCount})` : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
