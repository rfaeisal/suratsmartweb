"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Tooltip } from "@/components/Tooltip"
import { SearchableSelect } from "@/components/SearchableSelect"

interface PositionOption {
  id: string
  name: string
  level: number
}

interface WorkUnitOption {
  id: string
  name: string
}

interface EmployeeOption {
  id: string
  legacyId: string
  fullName: string
  positionTitle: string | null
}

const EMPLOYEE_TYPE_OPTIONS = [
  { value: "PNS", label: "PNS" },
  { value: "PPPK", label: "PPPK" },
  { value: "PPPK_PARUH_WAKTU", label: "PPPK Paruh Waktu" },
  { value: "BLUD", label: "BLUD" },
] as const

interface Props {
  employeeId: string
  initial: {
    positionId: string | null
    unitId: string
    directSupervisorId: string | null
    employeeType: string
    isActive: boolean
  }
  positions: PositionOption[]
  workUnits: WorkUnitOption[]
  allEmployees: EmployeeOption[]
  onSaved: (updated: {
    positionId: string | null
    positionName: string | null
    unitId: string
    unitName: string
    directSupervisorId: string | null
    employeeType: string
    isActive: boolean
  }) => void
}

export default function EmployeeEditForm({ employeeId, initial, positions, workUnits, allEmployees, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [positionId, setPositionId] = useState(initial.positionId ?? "")
  const [unitId, setUnitId] = useState(initial.unitId)
  const [supervisorLegacyId, setSupervisorLegacyId] = useState(initial.directSupervisorId ?? "")
  const [employeeType, setEmployeeType] = useState(initial.employeeType)
  const [isActive, setIsActive] = useState(initial.isActive)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const unitOptions = [...workUnits]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => ({ value: u.id, label: u.name }))

  const positionOptions = [...positions]
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.name, sub: `Level ${p.level}` }))

  const supervisorOptions = allEmployees
    .filter((e) => e.id !== employeeId)
    .map((e) => ({ value: e.legacyId, label: e.fullName, sub: e.positionTitle ?? "" }))

  async function save() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/admin/employees/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId: positionId || null,
          unitId: unitId || undefined,
          directSupervisorLegacyId: supervisorLegacyId || null,
          employeeType,
          isActive,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error?.message ?? "Gagal menyimpan")
      } else {
        const selectedPos = positions.find((p) => p.id === positionId) ?? null
        const selectedUnit = workUnits.find((u) => u.id === unitId)
        onSaved({
          positionId: positionId || null,
          positionName: selectedPos?.name ?? null,
          unitId,
          unitName: selectedUnit?.name ?? "",
          directSupervisorId: supervisorLegacyId || null,
          employeeType,
          isActive,
        })
        setOpen(false)
      }
    } catch {
      setError("Koneksi gagal")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Tooltip label="Edit">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </Tooltip>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl ring-1 ring-black/5 w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Edit Data Pegawai</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Status</label>
                <div className="flex gap-2">
                  {[
                    { value: true, label: "Aktif", cls: "bg-emerald-600 text-white border-emerald-600" },
                    { value: false, label: "Non-Aktif", cls: "bg-gray-500 text-white border-gray-500" },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setIsActive(opt.value)}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        isActive === opt.value
                          ? opt.cls
                          : "bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-gray-400 dark:text-slate-500">
                  Pegawai non-aktif tidak bisa login / absen. Status override manual bertahan meski di-sync ulang dari legacy.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Jenis Pegawai</label>
                <select
                  value={employeeType}
                  onChange={(e) => setEmployeeType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EMPLOYEE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Unit Kerja</label>
                <SearchableSelect
                  options={unitOptions}
                  value={unitId}
                  onChange={setUnitId}
                  placeholder="Cari unit kerja…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Jabatan</label>
                <SearchableSelect
                  options={positionOptions}
                  value={positionId}
                  onChange={setPositionId}
                  placeholder="Cari jabatan…"
                  allowEmpty
                  emptyLabel="— Tidak ada —"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Atasan Langsung</label>
                <SearchableSelect
                  options={supervisorOptions}
                  value={supervisorLegacyId}
                  onChange={setSupervisorLegacyId}
                  placeholder="Cari nama pegawai…"
                  allowEmpty
                  emptyLabel="— Tidak ada / belum diatur —"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
