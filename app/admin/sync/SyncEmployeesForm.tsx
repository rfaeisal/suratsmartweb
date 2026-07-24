"use client"

import { useState } from "react"

interface PreviewEmployee {
  legacyId: string
  nip: string
  fullName: string
}

interface PreviewResult {
  totalFromLegacy: number
  newCount: number
  employees: PreviewEmployee[]
}

interface ImportResult {
  total: number
  imported: number
  skipped: number
  failed: number
  errors: { legacyId: string; fullName: string; error: string }[]
}

export default function SyncEmployeesForm() {
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  async function handlePreview() {
    setPreviewing(true)
    setPreview(null)
    setImportResult(null)
    setSelected(new Set())
    setError("")
    try {
      const res = await fetch("/api/v1/admin/sync/employees")
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? "Gagal mengambil data"); return }
      setPreview(data)
      setSearch("")
      setSelected(new Set(data.employees.map((e: PreviewEmployee) => e.legacyId)))
    } catch {
      setError("Koneksi gagal")
    } finally {
      setPreviewing(false)
    }
  }

  function toggleAll() {
    if (!preview) return
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach((e) => next.delete(e.legacyId))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach((e) => next.add(e.legacyId))
        return next
      })
    }
  }

  function toggleOne(legacyId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(legacyId)) next.delete(legacyId)
      else next.add(legacyId)
      return next
    })
  }

  async function handleImport() {
    if (selected.size === 0) return
    setImporting(true)
    setError("")
    try {
      const res = await fetch("/api/v1/admin/sync/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legacyIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) { setError(data.error?.message ?? "Gagal mengimpor"); return }
      setImportResult(data)
      setPreview(null)
      setSelected(new Set())
    } catch {
      setError("Koneksi gagal")
    } finally {
      setImporting(false)
    }
  }

  const filtered = preview
    ? preview.employees.filter((e) => {
        const q = search.toLowerCase().trim()
        return !q || e.fullName.toLowerCase().includes(q) || e.nip.includes(q)
      })
    : []

  const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.legacyId))
  const someSelected = filtered.some((e) => selected.has(e.legacyId)) && !allSelected

  return (
    <div className="space-y-6">
      {/* Tombol cek */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Cari Pegawai Baru dari Sistem Lama</h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
          Sistem akan memeriksa daftar pegawai di sistem kepegawaian lama dan menampilkan pegawai yang NIP-nya belum terdaftar di CutiSmart.
        </p>
        <button
          onClick={handlePreview}
          disabled={previewing}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {previewing ? "Mengambil data…" : "Cek Pegawai Baru"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {/* Hasil import */}
      {importResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{importResult.total}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Dipilih</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-green-200 dark:border-green-800 p-4 text-center">
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{importResult.imported}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Berhasil Diimpor</p>
            </div>
            <div className={`bg-white dark:bg-slate-800 rounded-xl border p-4 text-center ${importResult.failed > 0 ? "border-red-200 dark:border-red-800" : "border-gray-200 dark:border-slate-700"}`}>
              <p className={`text-2xl font-bold ${importResult.failed > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-slate-500"}`}>
                {importResult.failed}
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Gagal</p>
            </div>
          </div>

          {importResult.imported > 0 && importResult.failed === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
              {importResult.imported} pegawai baru berhasil ditambahkan ke CutiSmart.
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">{importResult.errors.length} gagal diimpor</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {importResult.errors.map((e) => (
                  <div key={e.legacyId} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{e.fullName}</p>
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400 text-right max-w-xs">{e.error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Preview daftar pegawai baru */}
      {preview && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {preview.newCount === 0
                  ? "Tidak ada pegawai baru"
                  : `${preview.newCount} pegawai baru ditemukan`}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                Total di sistem lama: {preview.totalFromLegacy} •{" "}
                Sudah ada di CutiSmart: {preview.totalFromLegacy - preview.newCount}
              </p>
            </div>
            {preview.newCount > 0 && (
              <button
                onClick={handleImport}
                disabled={importing || selected.size === 0}
                className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors shrink-0"
              >
                {importing ? "Mengimpor…" : `Import ${selected.size} Pegawai`}
              </button>
            )}
          </div>

          {preview.newCount === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-slate-500">
              Semua pegawai dari sistem lama sudah ada di CutiSmart.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama atau NIP…"
                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">NIP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Nama Pegawai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-slate-500">
                        Tidak ada pegawai yang cocok dengan pencarian.
                      </td>
                    </tr>
                  ) : filtered.map((emp) => (
                    <tr
                      key={emp.legacyId}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      onClick={() => toggleOne(emp.legacyId)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(emp.legacyId)}
                          onChange={() => toggleOne(emp.legacyId)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-slate-400">{emp.nip}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{emp.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {preview.newCount > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {selected.size} dari {preview.newCount} dipilih
              </span>
              <button
                onClick={handleImport}
                disabled={importing || selected.size === 0}
                className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {importing ? "Mengimpor…" : `Import ${selected.size} Pegawai`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
