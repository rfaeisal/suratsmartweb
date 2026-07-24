"use client"

import { useState, useCallback } from "react"

interface WorkUnit { id: string; name: string }
interface ShiftInfo { id: string; nama: string; type: string; startTime: string; endTime: string }
interface Employee { id: string; fullName: string; nip: string }
interface RosterPeriod { id: string; year: number; month: number; status: string; work_unit_id: string }
interface RosterEntry { id: string; employee_id: string; shift_id: string; tanggal_kerja: string }

type RosterUserRole = "ADMIN_KEPEGAWAIAN" | "SUPERADMIN" | "KEPALA_UNIT" | "ADMIN_UNIT"

interface Props {
  units: WorkUnit[]
  shifts: ShiftInfo[]
  lockedUnitId: string | null
  userRole: RosterUserRole
}

const inputClass = "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
const SHIFT_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700",
  "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700",
  "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700",
  "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700",
  "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-700",
  "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700",
]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED")
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Dipublikasikan</span>
  if (status === "PENDING_APPROVAL")
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Menunggu Persetujuan</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Draft</span>
}

export default function RosterClient({ units, shifts, lockedUnitId, userRole }: Props) {
  const now = new Date()
  const [selectedUnit, setSelectedUnit] = useState(lockedUnitId ?? "")
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [period, setPeriod] = useState<RosterPeriod | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rosters, setRosters] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [clearingEmp, setClearingEmp] = useState<string | null>(null)
  const [generatingEmp, setGeneratingEmp] = useState<string | null>(null)

  const isAdmin = userRole === "ADMIN_KEPEGAWAIAN" || userRole === "SUPERADMIN"
  const isKepalaUnit = userRole === "KEPALA_UNIT"
  const isAdminUnit = userRole === "ADMIN_UNIT"

  function canEditCell(status: string) {
    if (status === "PUBLISHED") return false
    if (status === "PENDING_APPROVAL" && isAdminUnit) return false
    return true
  }

  const shiftColorMap = useCallback((shiftId: string) => {
    const idx = shifts.findIndex((s) => s.id === shiftId)
    return SHIFT_COLORS[idx % SHIFT_COLORS.length] ?? SHIFT_COLORS[0]
  }, [shifts])

  async function loadPeriod() {
    if (!selectedUnit) { setError("Pilih unit kerja terlebih dahulu"); return }
    setLoading(true)
    setError("")
    setPeriod(null)
    setRosters([])
    setEmployees([])
    setSelectedShiftId(null)
    try {
      const res = await fetch(`/api/v1/roster-periods?work_unit_id=${selectedUnit}&year=${year}&month=${month}`)
      const data = await res.json()
      if (!res.ok && res.status !== 404) { setError(data.error?.message ?? "Gagal memuat"); return }

      let p: RosterPeriod | null = data.data?.[0] ?? null

      if (!p) {
        const createRes = await fetch("/api/v1/roster-periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_unit_id: selectedUnit, year, month }),
        })
        const created = await createRes.json()
        if (!createRes.ok) { setError(created.error?.message ?? "Gagal membuat periode"); return }
        p = created
      }

      setPeriod(p!)

      const [empRes, rosterRes] = await Promise.all([
        fetch(`/api/v1/admin/employees?unitId=${selectedUnit}&perPage=500`),
        fetch(`/api/v1/rosters?period_id=${p!.id}&limit=1000`),
      ])
      const empData = await empRes.json()
      const rosterData = await rosterRes.json()
      setEmployees(empData.data ?? [])
      setRosters(rosterData.data ?? [])
    } catch { setError("Koneksi gagal") }
    finally { setLoading(false) }
  }

  async function handleGenerate() {
    if (!period) return
    setGenerating(true)
    setError("")
    try {
      const res = await fetch("/api/v1/rosters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: period.id }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? "Gagal generate"); return }
      const rosterRes = await fetch(`/api/v1/rosters?period_id=${period.id}&limit=1000`)
      const rosterData = await rosterRes.json()
      setRosters(rosterData.data ?? [])
    } catch { setError("Koneksi gagal") }
    finally { setGenerating(false) }
  }

  async function callPeriodAction(action: string) {
    if (!period) return
    setActionLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/roster-periods/${period.id}/${action}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? "Gagal"); return }
      setPeriod((p) => p ? { ...p, status: data.status } : p)
    } catch { setError("Koneksi gagal") }
    finally { setActionLoading(false) }
  }

  async function handleCellChange(empId: string, date: string, shiftId: string) {
    const cellKey = `${empId}|${date}`
    setSavingCell(cellKey)
    const existing = rosters.find((r) => r.employee_id === empId && r.tanggal_kerja.startsWith(date))
    try {
      if (existing) {
        if (!shiftId) {
          const res = await fetch(`/api/v1/rosters/${existing.id}`, { method: "DELETE" })
          if (res.ok) setRosters((prev) => prev.filter((r) => r.id !== existing.id))
        } else {
          const res = await fetch(`/api/v1/rosters/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: shiftId }),
          })
          const data = await res.json()
          if (res.ok) setRosters((prev) => prev.map((r) => r.id === existing.id ? { ...r, shift_id: data.shift_id } : r))
        }
      } else if (shiftId && period) {
        const res = await fetch("/api/v1/rosters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: empId, period_id: period.id, shift_id: shiftId, tanggal_kerja: date }),
        })
        const data = await res.json()
        if (res.ok) setRosters((prev) => [...prev, data])
      }
    } finally { setSavingCell(null) }
  }

  async function handleGenerateEmployee(empId: string) {
    if (!period) return
    setGeneratingEmp(empId)
    setError("")
    try {
      const res = await fetch("/api/v1/rosters/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: period.id, employee_id: empId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? "Gagal generate"); return }
      const rosterRes = await fetch(`/api/v1/rosters?period_id=${period.id}&limit=1000`)
      const rosterData = await rosterRes.json()
      setRosters(rosterData.data ?? [])
    } catch { setError("Koneksi gagal") }
    finally { setGeneratingEmp(null) }
  }

  async function handleClearEmployee(empId: string) {
    const empRosters = rosters.filter((r) => r.employee_id === empId)
    if (empRosters.length === 0) return
    setClearingEmp(empId)
    try {
      await Promise.all(
        empRosters.map((r) => fetch(`/api/v1/rosters/${r.id}`, { method: "DELETE" }))
      )
      setRosters((prev) => prev.filter((r) => r.employee_id !== empId))
    } catch { setError("Gagal mengosongkan jadwal") }
    finally { setClearingEmp(null) }
  }

  const days = period ? getDaysInMonth(period.year, period.month) : 0
  const dayList = Array.from({ length: days }, (_, i) => i + 1)

  function getRosterForCell(empId: string, day: number) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return rosters.find((r) => r.employee_id === empId && r.tanggal_kerja.startsWith(dateStr))
  }

  function getDayOfWeek(day: number) {
    return new Date(year, month - 1, day).getDay()
  }

  const cellEditable = period ? canEditCell(period.status) : false

  return (
    <div className="space-y-4">

      {/* ── Judul ── */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Roster Pegawai</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          {isAdminUnit
            ? "Atur jadwal shift pegawai dan ajukan ke Kepala Unit untuk dipublikasikan."
            : "Atur jadwal shift pegawai per periode. Gunakan Auto-Generate untuk shift tetap, atau atur manual tiap pegawai."}
        </p>
      </div>

      {/* ── Filter ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-5 py-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 w-56">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Unit Kerja</label>
          {lockedUnitId ? (
            <div className={`${inputClass} bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400`}>
              {units[0]?.name ?? lockedUnitId}
            </div>
          ) : (
            <select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)} className={inputClass}>
              <option value="">— Pilih Unit —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Tahun</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
            {[-1, 0, 1].map((d) => <option key={d} value={now.getFullYear() + d}>{now.getFullYear() + d}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Bulan</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputClass}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button
          onClick={loadPeriod}
          disabled={loading}
          className="px-5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Memuat…" : "Tampilkan"}
        </button>
        {error && <p className="text-xs text-red-600 dark:text-red-400 w-full">{error}</p>}
      </div>

      {/* ── Status + Shift Palette + Actions ── */}
      {period && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
              {MONTH_NAMES[period.month - 1]} {period.year}
            </span>
            <span className="text-sm text-gray-400 dark:text-slate-500">—</span>
            <span className="text-sm text-gray-600 dark:text-slate-300">
              {units.find((u) => u.id === period.work_unit_id)?.name}
            </span>
            <StatusBadge status={period.status} />
          </div>

          <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 shrink-0 hidden sm:block" />

          <div className="flex flex-wrap gap-2 flex-1 min-w-0">
            {cellEditable && (
              <button
                onClick={() => setSelectedShiftId(selectedShiftId === "" ? null : "")}
                className={`inline-flex items-center px-3 py-1 rounded-lg text-xs border font-medium transition-all ${
                  selectedShiftId === ""
                    ? "bg-red-600 text-white border-red-600 dark:bg-red-500 dark:border-red-500 ring-2 ring-red-400 ring-offset-1 shadow-md scale-105"
                    : "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50"
                }`}
              >
                — Libur
              </button>
            )}
            {shifts.map((s, i) => (
              <button
                key={s.id}
                onClick={() => cellEditable && setSelectedShiftId(selectedShiftId === s.id ? null : s.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs border font-medium transition-all ${SHIFT_COLORS[i % SHIFT_COLORS.length]} ${
                  cellEditable ? "cursor-pointer" : "cursor-default"
                } ${
                  selectedShiftId === s.id
                    ? "ring-2 ring-current ring-offset-1 shadow-md scale-105"
                    : cellEditable ? "hover:opacity-80" : ""
                }`}
              >
                <span className="font-semibold">{s.nama}</span>
                <span className="opacity-70">{s.startTime}–{s.endTime}</span>
              </button>
            ))}
            {cellEditable && selectedShiftId !== null && (
              <span className="self-center text-xs text-blue-600 dark:text-blue-400 ml-1">
                ← klik tanggal untuk mengisi
              </span>
            )}
            {cellEditable && selectedShiftId === null && (
              <span className="self-center text-xs text-gray-400 dark:text-slate-500 ml-1">
                Pilih shift di atas lalu klik tanggal
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {period.status === "DRAFT" && (
              <button onClick={handleGenerate} disabled={generating}
                className="px-4 py-1.5 text-sm border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors font-medium">
                {generating ? "Generating…" : "Auto-Generate"}
              </button>
            )}
            {isAdminUnit && period.status === "DRAFT" && (
              <button onClick={() => callPeriodAction("submit")} disabled={actionLoading}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
                {actionLoading ? "…" : "Ajukan"}
              </button>
            )}
            {isAdminUnit && period.status === "PENDING_APPROVAL" && (
              <button onClick={() => callPeriodAction("return")} disabled={actionLoading}
                className="px-4 py-1.5 text-sm border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/30 disabled:opacity-50 transition-colors font-medium">
                {actionLoading ? "…" : "Batalkan Pengajuan"}
              </button>
            )}
            {isKepalaUnit && period.status === "PENDING_APPROVAL" && (
              <>
                <button onClick={() => callPeriodAction("return")} disabled={actionLoading}
                  className="px-4 py-1.5 text-sm border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/30 disabled:opacity-50 transition-colors font-medium">
                  {actionLoading ? "…" : "Kembalikan"}
                </button>
                <button onClick={() => callPeriodAction("publish")} disabled={actionLoading}
                  className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium">
                  {actionLoading ? "…" : "Publikasikan"}
                </button>
              </>
            )}
            {isKepalaUnit && period.status === "PUBLISHED" && (
              <button onClick={() => callPeriodAction("unpublish")} disabled={actionLoading}
                className="px-4 py-1.5 text-sm border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/30 disabled:opacity-50 transition-colors font-medium">
                {actionLoading ? "…" : "Batalkan Publikasi"}
              </button>
            )}
            {isAdmin && period.status !== "PUBLISHED" && (
              <button onClick={() => callPeriodAction("publish")} disabled={actionLoading}
                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium">
                {actionLoading ? "…" : "Publikasikan"}
              </button>
            )}
            {isAdmin && period.status === "PUBLISHED" && (
              <button onClick={() => callPeriodAction("unpublish")} disabled={actionLoading}
                className="px-4 py-1.5 text-sm border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/30 disabled:opacity-50 transition-colors font-medium">
                {actionLoading ? "…" : "Batalkan Publikasi"}
              </button>
            )}
          </div>

          {isAdminUnit && period.status === "PENDING_APPROVAL" && (
            <p className="text-xs text-orange-600 dark:text-orange-400 w-full">
              Roster dikunci sementara menunggu persetujuan Kepala Unit. Klik "Batalkan Pengajuan" untuk mengedit kembali.
            </p>
          )}
        </div>
      )}

      {/* ── Grid Roster ── */}
      {period && employees.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="text-xs border-separate border-spacing-0 w-max min-w-full">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-gray-50 dark:bg-slate-900 text-left px-3 py-2.5 font-semibold text-gray-600 dark:text-slate-400 whitespace-nowrap min-w-[240px] border-b-2 border-r border-gray-300 dark:border-slate-600">
                    Pegawai
                  </th>
                  {dayList.map((d) => {
                    const dow = getDayOfWeek(d)
                    const isSunday = dow === 0
                    return (
                      <th key={d} className={`sticky top-0 z-20 px-0.5 py-2.5 text-center font-semibold w-[58px] min-w-[58px] border-b-2 border-r border-gray-200 dark:border-slate-700 ${
                        isSunday
                          ? "bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400"
                          : "bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400"
                      }`}>
                        <div className="text-sm leading-tight">{d}</div>
                        <div className="text-[10px] font-normal leading-tight">{DAY_SHORT[dow]}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="group">
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-slate-700 px-3 py-1.5 whitespace-nowrap border-b border-r border-gray-100 dark:border-slate-700 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-slate-100 text-xs leading-tight">{emp.fullName}</p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-tight">{emp.nip}</p>
                        </div>
                        {cellEditable && (() => {
                            const hasRoster = rosters.some(r => r.employee_id === emp.id)
                            const isClearing = clearingEmp === emp.id
                            const isGenerating = generatingEmp === emp.id
                            const busy = isClearing || isGenerating
                            return (
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Generate per pegawai */}
                                <button
                                  onClick={() => handleGenerateEmployee(emp.id)}
                                  disabled={busy || hasRoster}
                                  title={hasRoster ? "Kosongkan jadwal dulu sebelum generate" : "Auto-generate shift tetap untuk pegawai ini"}
                                  className={`p-1.5 rounded-lg transition-all ${
                                    busy || hasRoster
                                      ? "bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed"
                                      : "bg-blue-100 dark:bg-blue-950/60 text-blue-500 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/70 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                                  }`}
                                >
                                  {isGenerating ? (
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polygon points="5 3 19 12 5 21 5 3"/>
                                    </svg>
                                  )}
                                </button>
                                {/* Kosongkan per pegawai */}
                                <button
                                  onClick={() => handleClearEmployee(emp.id)}
                                  disabled={busy || !hasRoster}
                                  title="Kosongkan semua jadwal pegawai ini"
                                  className={`p-1.5 rounded-lg transition-all ${
                                    busy || !hasRoster
                                      ? "bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed"
                                      : "bg-red-100 dark:bg-red-950/60 text-red-500 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/70 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                                  }`}
                                >
                                  {isClearing ? (
                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                                    </svg>
                                  )}
                                </button>
                              </div>
                            )
                          })()}
                      </div>
                    </td>
                    {dayList.map((d) => {
                      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
                      const roster = getRosterForCell(emp.id, d)
                      const cellKey = `${emp.id}|${dateStr}`
                      const isSaving = savingCell === cellKey
                      const shift = roster ? shifts.find((s) => s.id === roster.shift_id) : null
                      const isSunday = getDayOfWeek(d) === 0
                      const clickable = cellEditable && selectedShiftId !== null && !isSaving

                      return (
                        <td key={d} className={`px-0.5 py-0.5 text-center border-b border-r border-gray-100 dark:border-slate-700 transition-colors ${
                          isSunday
                            ? "bg-red-50/60 dark:bg-red-950/10 group-hover:bg-red-100/60 dark:group-hover:bg-red-900/20"
                            : "bg-white dark:bg-slate-800 group-hover:bg-gray-50 dark:group-hover:bg-slate-700/40"
                        }`}>
                          {isSaving ? (
                            <div className="h-7 flex items-center justify-center text-gray-300 dark:text-slate-600 text-[10px]">…</div>
                          ) : (
                            <button
                              disabled={!clickable}
                              onClick={() => {
                                if (!clickable) return
                                if (selectedShiftId === "") {
                                  // Libur — hapus roster jika ada
                                  if (roster) handleCellChange(emp.id, dateStr, "")
                                } else if (roster?.shift_id === selectedShiftId) {
                                  // Toggle off — hapus roster
                                  handleCellChange(emp.id, dateStr, "")
                                } else {
                                  handleCellChange(emp.id, dateStr, selectedShiftId!)
                                }
                              }}
                              title={
                                !cellEditable ? undefined
                                : selectedShiftId === null ? "Pilih shift di panel atas terlebih dahulu"
                                : selectedShiftId === "" ? "Klik untuk tandai Libur"
                                : `Klik untuk isi dengan ${shifts.find(s => s.id === selectedShiftId)?.nama}`
                              }
                              className={`w-full h-7 rounded border text-[10px] font-medium transition-all ${
                                shift ? shiftColorMap(shift.id) : "border-gray-100 dark:border-slate-600 text-gray-300 dark:text-slate-600"
                              } ${clickable ? "cursor-pointer hover:opacity-70 hover:scale-95" : "cursor-default"}`}
                            >
                              {shift ? shift.nama : "—"}
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {period && employees.length === 0 && !loading && (
        <p className="py-16 text-center text-sm text-gray-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          Tidak ada pegawai di unit ini.
        </p>
      )}

      {!period && !loading && (
        <p className="py-16 text-center text-sm text-gray-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          Pilih unit, tahun, dan bulan lalu klik Tampilkan.
        </p>
      )}
    </div>
  )
}
