"use client"

import { useState } from "react"

interface SyncResult {
  total: number
  synced: number
  failed: number
  errors: { legacyId: string; fullName: string; error: string }[]
}

interface Props {
  units: { id: string; name: string }[]
}

export default function SyncEmployeesForm({ units }: Props) {
  const [unitId, setUnitId] = useState("")
  const [updatedSince, setUpdatedSince] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setResult(null)
    setError(null)

    const body: Record<string, string> = {}
    if (unitId) body.unitId = unitId
    if (updatedSince) body.updatedSince = new Date(updatedSince).toISOString()

    try {
      const res = await fetch("/api/v1/admin/sync/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) {
        setError(data.error?.message ?? "Gagal menghubungi server")
      } else {
        setResult(data)
      }
    } catch {
      setError("Koneksi gagal")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Filter Sinkronisasi</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Kerja</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Diperbarui Sejak <span className="text-gray-400">(opsional, untuk incremental sync)</span>
            </label>
            <input
              type="datetime-local"
              value={updatedSince}
              onChange={(e) => setUpdatedSince(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Menyinkronkan…" : "Tarik & Sinkronkan Data Pegawai"}
          </button>
          {loading && (
            <span className="text-sm text-gray-500">Menghubungi sistem lama…</span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{result.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total Pegawai</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{result.synced}</p>
              <p className="text-xs text-gray-500 mt-0.5">Berhasil Disinkronkan</p>
            </div>
            <div className={`bg-white rounded-xl border p-4 text-center ${result.failed > 0 ? "border-red-200" : "border-gray-200"}`}>
              <p className={`text-2xl font-bold ${result.failed > 0 ? "text-red-600" : "text-gray-400"}`}>{result.failed}</p>
              <p className="text-xs text-gray-500 mt-0.5">Gagal</p>
            </div>
          </div>

          {/* Success banner */}
          {result.failed === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
              Semua {result.total} data pegawai berhasil disinkronkan.
            </div>
          )}

          {/* Error detail */}
          {result.errors.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 bg-red-50">
                <p className="text-sm font-semibold text-red-700">
                  {result.errors.length} pegawai gagal disinkronkan
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {result.errors.map((e) => (
                  <div key={e.legacyId} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{e.fullName}</p>
                      <p className="text-xs text-gray-400">ID: {e.legacyId}</p>
                    </div>
                    <p className="text-xs text-red-600 text-right max-w-xs">{e.error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
