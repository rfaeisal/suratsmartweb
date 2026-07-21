"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import EmployeeEditForm from "./EmployeeEditForm"

interface PositionInfo {
  id: string
  name: string
  level: number
}

interface WorkUnitInfo {
  id: string
  name: string
}

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
  positionId: string | null
  position: PositionInfo | null
  directSupervisorId: string | null
  isActive: boolean
  unit: { id: string; name: string } | null
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
  PPPK_PARUH_WAKTU: "PPPK Paruh Waktu",
  BLUD: "BLUD",
}

export default function EmployeesPage() {
  const [data, setData] = useState<PageData | null>(null)
  const [allEmployees, setAllEmployees] = useState<EmployeeOption[]>([])
  const [positions, setPositions] = useState<PositionInfo[]>([])
  const [workUnits, setWorkUnits] = useState<WorkUnitInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [search, setSearch] = useState("")
  const [filterUnitId, setFilterUnitId] = useState("")
  const [employeeType, setEmployeeType] = useState("")
  const [page, setPage] = useState(1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const qs = new URLSearchParams()
      if (search) qs.set("search", search)
      if (filterUnitId) qs.set("unitId", filterUnitId)
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
  }, [search, filterUnitId, employeeType, page])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    fetch("/api/v1/admin/employees?page=1&perPage=1000")
      .then((r) => r.json())
      .then((d: PageData) =>
        setAllEmployees(
          d.data.map((e) => ({ id: e.id, legacyId: e.legacyId, fullName: e.fullName, positionTitle: e.position?.name ?? e.positionTitle }))
        )
      )
      .catch(() => {})

    fetch("/api/v1/admin/positions")
      .then((r) => r.json())
      .then((list: PositionInfo[]) => setPositions(list))
      .catch(() => {})

    fetch("/api/v1/admin/units")
      .then((r) => r.json())
      .then((list: WorkUnitInfo[]) => setWorkUnits(list))
      .catch(() => {})
  }, [])

  function handleSaved(
    id: string,
    updated: { positionId: string | null; positionName: string | null; unitId: string; unitName: string; directSupervisorId: string | null; employeeType: string; }
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
              positionId: updated.positionId,
              positionTitle: updated.positionName,
              position: updated.positionId
                ? (positions.find((p) => p.id === updated.positionId) ?? null)
                : null,
              unit: { id: updated.unitId, name: updated.unitName },
              directSupervisorId: updated.directSupervisorId,
              supervisor: supervisorInfo
                ? { legacyId: supervisorInfo.legacyId, fullName: supervisorInfo.fullName, positionTitle: supervisorInfo.positionTitle }
                : null,
              employeeType: updated.employeeType,
            }
          : e
      ),
    })
  }

  const activeFilterCount = [search, filterUnitId, employeeType].filter(Boolean).length

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Daftar Pegawai</h1>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 space-y-3">
        {/* Row 1: search + unit */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Cari nama, NIP, atau jabatan…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setPage(1) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* Unit select */}
          <div className="relative sm:w-56">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <select
              value={filterUnitId}
              onChange={(e) => { setFilterUnitId(e.target.value); setPage(1) }}
              className="w-full appearance-none pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Semua unit kerja</option>
              {[...workUnits].sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        {/* Row 2: tipe pegawai pills + reset */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium shrink-0">Tipe:</span>
          {[{ value: "", label: "Semua" }, ...Object.entries(EMPLOYEE_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setEmployeeType(value); setPage(1) }}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                employeeType === value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}

          {activeFilterCount > 0 && (
            <button
              onClick={() => { setSearch(""); setFilterUnitId(""); setEmployeeType(""); setPage(1) }}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Reset filter ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Memuat…</div>
      ) : !data || data.data.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">
          {search || filterUnitId || employeeType ? "Tidak ada pegawai yang cocok dengan filter." : "Belum ada data pegawai. Lakukan sinkronisasi terlebih dahulu."}
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Kerja</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jabatan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Atasan Langsung</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipe</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((emp) => {
                    const jabatan = emp.position?.name ?? emp.positionTitle
                    const jabatanLevel = emp.position?.level
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{emp.fullName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{emp.nip}</p>
                        </td>
                        <td className="px-4 py-3">
                          {emp.unit ? (
                            <Link
                              href={`/admin/units/${emp.unit.id}`}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {emp.unit.name}
                            </Link>
                          ) : (
                            <span className="text-gray-300 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {jabatan ? (
                            <div>
                              <p className="text-gray-900">{jabatan}</p>
                              {jabatanLevel !== undefined && (
                                <p className="text-xs text-gray-400 mt-0.5">Level {jabatanLevel}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 italic">—</span>
                          )}
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
                            emp.employeeType === "PPPK_PARUH_WAKTU" ? "bg-teal-50 text-teal-700" :
                            "bg-amber-50 text-amber-700"
                          }`}>
                            {EMPLOYEE_TYPE_LABELS[emp.employeeType] ?? emp.employeeType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <EmployeeEditForm
                            employeeId={emp.id}
                            initial={{
                              positionId: emp.positionId,
                              unitId: emp.unit?.id ?? "",
                              directSupervisorId: emp.directSupervisorId,
                              employeeType: emp.employeeType,
                            }}
                            positions={positions}
                            workUnits={workUnits}
                            allEmployees={allEmployees}
                            onSaved={(updated) => handleSaved(emp.id, updated)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

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

