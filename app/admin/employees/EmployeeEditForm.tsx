"use client"

import { useState } from "react"

interface PositionOption {
  id: string
  name: string
  level: number
}

interface EmployeeOption {
  id: string
  legacyId: string
  fullName: string
  positionTitle: string | null
}

interface Props {
  employeeId: string
  initial: {
    positionId: string | null
    room: string | null
    directSupervisorId: string | null
  }
  positions: PositionOption[]
  allEmployees: EmployeeOption[]
  onSaved: (updated: {
    positionId: string | null
    positionName: string | null
    room: string | null
    directSupervisorId: string | null
  }) => void
}

export default function EmployeeEditForm({ employeeId, initial, positions, allEmployees, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [positionId, setPositionId] = useState(initial.positionId ?? "")
  const [room, setRoom] = useState(initial.room ?? "")
  const [supervisorLegacyId, setSupervisorLegacyId] = useState(initial.directSupervisorId ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Urutkan dari level tertinggi ke terendah
  const sortedPositions = [...positions].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))

  async function save() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/admin/employees/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId: positionId || null,
          room: room || undefined,
          directSupervisorLegacyId: supervisorLegacyId || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error?.message ?? "Gagal menyimpan")
      } else {
        const selectedPos = positions.find((p) => p.id === positionId) ?? null
        onSaved({
          positionId: positionId || null,
          positionName: selectedPos?.name ?? null,
          room: room || null,
          directSupervisorId: supervisorLegacyId || null,
        })
        setOpen(false)
      }
    } catch {
      setError("Koneksi gagal")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
      >
        Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Edit Data Pegawai</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Jabatan</label>
                <select
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Pilih jabatan —</option>
                  {sortedPositions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.name} (Level {pos.level})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ruangan</label>
                <input
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="Contoh: Ruang 201, Gedung A"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Atasan Langsung</label>
                <select
                  value={supervisorLegacyId}
                  onChange={(e) => setSupervisorLegacyId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Tidak ada / belum diatur —</option>
                  {allEmployees
                    .filter((e) => e.id !== employeeId)
                    .map((e) => (
                      <option key={e.legacyId} value={e.legacyId}>
                        {e.fullName}{e.positionTitle ? ` — ${e.positionTitle}` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
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
        </div>
      )}
    </>
  )
}
