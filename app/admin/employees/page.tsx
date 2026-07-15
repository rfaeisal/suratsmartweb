"use client"

import { useEffect, useState, useCallback } from "react"
import EmployeeEditForm from "./EmployeeEditForm"

interface Supervisor {
  legacyId: string
  fullName: string
  positionTitle: string | null
}

interface EmployeeRow {
  id: string
  legacyId: string
  nip: string
  fullName: string
  employeeType: string
  positionTitle: string | null
  room: string | null
  directSupervisorId: string | null
  isActive: boolean
  unit: { id: string; name: string }
  supervisor: Supervisor | null
}

interface PageData {
  data: EmployeeRow[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

interface EmployeeOption {
  id: string
  legacyId: string
  fullName: string
  positionTitle: string | null
}

const EMPLOYEE_TYPE_LABELS: Record<string, string> = {
  PNS: "PNS",
  PPPK: "PPPK",
  BLUD: "BLUD",
}

export default function EmployeesPage() {
  const [data, setData] = useState<PageData | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [search, setSearch] = useState("")
  const [unitId, setUnitId] = useState("")
  const [employeeType, setEmployeeType] = useState("")
  const [page, setPage] = useState(1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const qs = new URLSearchParams()
      if (search) qs.set("search", search)
      if (unitId) qs.set("unitId", unitId)
      if (employeeType) qs.set("employeeType", employeeType)
      qs.set("page", String(page))
      const res = await fetch(`/api/v1/admin/employees?${qs}`)
      if (!res.ok) throw new Error("Gagal memuat data")
      setData(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan")
    } finally {
      setLoading(false)
    }
  }, [search, unitId, employeeType, page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Load all employees once for supervisor dropdown
  useEffect(() => {
    fetch("/api/v1/admin/employees?page=1&perPage=1000")
      .then((r) => r.json())
      .then((d: PageData) =>
        setAllEmployees(
          d.data.map((e) => ({ id: e.id, legacyId: e.legacyId, fullName: e.fullName, positionTitle: e.positionTitle }))
        )
      )
      .catch(() => {})
  }, [])

  function handleSaved(
    id: string,
    updated: { positionTitle: string | null; room: string | null; directSupervisorId: string | null }
  ) {
    if (!data) return
    const supervisorInfo = updated.directSupervisorId
      ? allEmployees.find((e) => e.legacyId === updated.directSupervisorId) ?? null
      : null
    setData({
      ...data,
      data: data.data.map((e) =>
        e.id === id
          ? {
              ...e,
              ...updated,
              supervisor: supervisorInfo
                ? { legacyId: supervisorInfo.legacyId, fullName: supervisorInfo.fullName, positionTitle: supervisorInfo.positionTitle }
                : null,
            }
          : e
      ),
    })
  }

  const inputClass = "px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Daftar Pegawai</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Cari nama / NIP / jabatan…"
          className={`${inputClass} w-64`}
        />
        <select
          value={employeeType}
          onChange={(e) => { setEmployeeType(e.target.value); setPage(1) }}
          className={inputClass}
        >
          <option value="">Semua tipe</option>
          {Object.entries(EMPLOYEE_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button
          onClick={() => { setSearch(""); setUnitId(""); setEmployeeType(""); setPage(1) }}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Memuat…</div>
      ) : !data || data.data.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">
          {search || employeeType ? "Tidak ada pegawai yang cocok dengan filter." : "Belum ada data pegawai. Lakukan sinkronisasi terlebih dahulu."}
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-3">
            Menampilkan {(data.page - 1) * data.perPage + 1}–{Math.min(data.page * data.perPage, data.total)} dari {data.total} pegawai
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama / NIP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jabatan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ruangan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Atasan Langsung</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipe</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{emp.fullName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{emp.nip}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{emp.unit.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {emp.positionTitle ?? <span className="text-gray-300 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {emp.room ?? <span className="text-gray-300 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {emp.supervisor ? (
                          <div>
                            <p>{emp.supervisor.fullName}</p>
                            {emp.supervisor.positionTitle && (
                              <p className="text-xs text-gray-400 mt-0.5">{emp.supervisor.positionTitle}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          emp.employeeType === "PNS" ? "bg-blue-50 text-blue-700" :
                          emp.employeeType === "PPPK" ? "bg-green-50 text-green-700" :
                          "bg-amber-50 text-amber-700"
                        }`}>
                          {emp.employeeType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <EmployeeEditForm
                          employeeId={emp.id}
                          initial={{
                            positionTitle: emp.positionTitle,
                            room: emp.room,
                            directSupervisorId: emp.directSupervisorId,
                          }}
                          allEmployees={allEmployees}
                          onSaved={(updated) => handleSaved(emp.id, updated)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                disabled={data.page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Sebelumnya
              </button>
              <span className="text-sm text-gray-500">
                Halaman {data.page} / {data.totalPages}
              </span>
              <button
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Berikutnya →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
