"use client"

import { useState } from "react"

interface WorkUnit { id: string; name: string }
interface ShiftUnit { id: string; workUnitId: string; workUnit: WorkUnit }
interface Shift {
  id: string
  nama: string
  type: string
  startTime: string
  endTime: string
  crossesMidnight: boolean
  workDays: number[] | null
  active: boolean
  shiftUnits: ShiftUnit[]
}

interface Props {
  initial: Shift[]
  units: WorkUnit[]
}

const inputClass = "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

export default function ShiftsClient({ initial, units }: Props) {
  const [shifts, setShifts] = useState<Shift[]>(initial)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [form, setForm] = useState({ nama: "", type: "ROTASI", startTime: "07:00", endTime: "14:00", workDays: [1, 2, 3, 4, 5] as number[] })

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addUnitId, setAddUnitId] = useState("")
  const [addingUnit, setAddingUnit] = useState(false)
  const [addUnitError, setAddUnitError] = useState("")
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})

  // Edit state
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [editForm, setEditForm] = useState({ nama: "", type: "ROTASI", startTime: "07:00", endTime: "14:00", workDays: [] as number[] })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")

  function openEdit(shift: Shift) {
    setEditingShift(shift)
    setEditForm({
      nama: shift.nama,
      type: shift.type,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays ?? [],
    })
    setEditError("")
  }

  function toggleEditDay(day: number) {
    setEditForm((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(day) ? prev.workDays.filter((d) => d !== day) : [...prev.workDays, day],
    }))
  }

  async function handleEditSave() {
    if (!editingShift) return
    if (!editForm.nama.trim()) { setEditError("Nama shift wajib diisi"); return }
    setSaving(true)
    setEditError("")
    try {
      const res = await fetch(`/api/v1/shifts/${editingShift.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: editForm.nama.trim(),
          type: editForm.type,
          start_time: editForm.startTime,
          end_time: editForm.endTime,
          work_days: editForm.workDays,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error?.message ?? "Gagal menyimpan"); return }
      setShifts((prev) =>
        prev.map((s) =>
          s.id === editingShift.id
            ? { ...s, nama: data.nama, type: data.type, startTime: data.start_time, endTime: data.end_time, workDays: data.work_days }
            : s
        ).sort((a, b) => a.nama.localeCompare(b.nama))
      )
      setEditingShift(null)
    } catch { setEditError("Koneksi gagal") }
    finally { setSaving(false) }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError("")
    if (!form.nama.trim()) { setAddError("Nama shift wajib diisi"); return }
    setAdding(true)
    try {
      const res = await fetch("/api/v1/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: form.nama, type: form.type, start_time: form.startTime, end_time: form.endTime, work_days: form.workDays }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error?.message ?? "Gagal menyimpan"); return }
      const newShift: Shift = {
        id: data.id,
        nama: data.nama,
        type: data.type,
        startTime: data.start_time,
        endTime: data.end_time,
        crossesMidnight: data.crosses_midnight,
        workDays: data.work_days,
        active: data.active,
        shiftUnits: [],
      }
      setShifts((prev) => [...prev, newShift].sort((a, b) => a.nama.localeCompare(b.nama)))
      setForm({ nama: "", type: "ROTASI", startTime: "07:00", endTime: "14:00", workDays: [1, 2, 3, 4, 5] })
    } catch { setAddError("Koneksi gagal") }
    finally { setAdding(false) }
  }

  function toggleDay(day: number) {
    setForm((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(day) ? prev.workDays.filter((d) => d !== day) : [...prev.workDays, day],
    }))
  }

  async function toggleActive(shift: Shift) {
    const res = await fetch(`/api/v1/shifts/${shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !shift.active }),
    })
    if (res.ok) {
      setShifts((prev) => prev.map((s) => s.id === shift.id ? { ...s, active: !s.active } : s))
    }
  }

  async function handleDelete(shift: Shift) {
    if (!confirm(`Hapus shift "${shift.nama}"?`)) return
    setDeleteErrors((prev) => { const next = { ...prev }; delete next[shift.id]; return next })
    const res = await fetch(`/api/v1/shifts/${shift.id}`, { method: "DELETE" })
    if (res.ok) {
      setShifts((prev) => prev.filter((s) => s.id !== shift.id))
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteErrors((prev) => ({ ...prev, [shift.id]: data.error?.message ?? "Gagal menghapus" }))
    }
  }

  async function handleAddUnit(shiftId: string) {
    setAddUnitError("")
    if (!addUnitId) { setAddUnitError("Pilih unit terlebih dahulu"); return }
    setAddingUnit(true)
    try {
      const res = await fetch(`/api/v1/shifts/${shiftId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_unit_id: addUnitId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAddUnitError(data.error?.message ?? "Gagal menambah unit"); return }
      const unit = units.find((u) => u.id === addUnitId)!
      const newShiftUnit: ShiftUnit = { id: data.id, workUnitId: data.workUnitId ?? addUnitId, workUnit: unit }
      setShifts((prev) => prev.map((s) => s.id === shiftId ? { ...s, shiftUnits: [...s.shiftUnits, newShiftUnit] } : s))
      setAddUnitId("")
    } catch { setAddUnitError("Koneksi gagal") }
    finally { setAddingUnit(false) }
  }

  async function handleRemoveUnit(shiftId: string, unitId: string) {
    const res = await fetch(`/api/v1/shifts/${shiftId}/units/${unitId}`, { method: "DELETE" })
    if (res.ok) {
      setShifts((prev) => prev.map((s) => s.id === shiftId ? { ...s, shiftUnits: s.shiftUnits.filter((su) => su.workUnitId !== unitId) } : s))
    }
  }

  return (
    <div className="space-y-6">
      {/* Modal Edit Shift */}
      {editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Edit Shift</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Nama Shift <span className="text-red-500">*</span></label>
                <input value={editForm.nama} onChange={(e) => setEditForm({ ...editForm, nama: e.target.value })} className={`${inputClass} w-full`} autoFocus />
              </div>
              <div className="flex gap-2">
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Tipe</label>
                  <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className={`${inputClass} w-full`}>
                    <option value="ROTASI">Rotasi</option>
                    <option value="TETAP">Tetap</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Mulai</label>
                  <input type="time" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })} className={`${inputClass} w-full`} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Selesai</label>
                  <input type="time" value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })} className={`${inputClass} w-full`} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Hari Kerja</label>
                <div className="flex gap-1.5">
                  {DAY_NAMES.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleEditDay(i)}
                      className={`w-9 h-9 text-xs rounded-lg border transition-colors ${editForm.workDays.includes(i) ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {editError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{editError}</p>}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setEditingShift(null)} className="px-4 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700">
                Batal
              </button>
              <button onClick={handleEditSave} disabled={saving} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Tambah Shift Baru</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-40">
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Nama Shift <span className="text-red-500">*</span></label>
              <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="misal: Shift Pagi" className={`${inputClass} w-full`} />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Tipe</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${inputClass} w-full`}>
                <option value="ROTASI">Rotasi</option>
                <option value="TETAP">Tetap</option>
              </select>
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Mulai</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={`${inputClass} w-full`} />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Selesai</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={`${inputClass} w-full`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Hari Kerja</label>
            <div className="flex gap-1.5">
              {DAY_NAMES.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 text-xs rounded-lg border transition-colors ${form.workDays.includes(i) ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-slate-700 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={adding} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {adding ? "Menyimpan…" : "Tambah Shift"}
            </button>
            {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
          </div>
        </form>
      </div>

      <div className="space-y-3">
        {shifts.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">Belum ada shift. Tambahkan di atas.</p>
        )}
        {shifts.map((shift) => (
          <div key={shift.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-slate-100">{shift.nama}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${shift.type === "ROTASI" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                    {shift.type === "ROTASI" ? "Rotasi" : "Tetap"}
                  </span>
                  {shift.type === "TETAP" && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      Semua unit
                    </span>
                  )}
                  {!shift.active && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400">Nonaktif</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  {shift.startTime} – {shift.endTime}
                  {shift.crossesMidnight && " (lintas tengah malam)"}
                  {" · "}
                  {(shift.workDays ?? []).map((d: number) => DAY_NAMES[d]).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {deleteErrors[shift.id] && <span className="text-xs text-red-600 dark:text-red-400">{deleteErrors[shift.id]}</span>}
                <button
                  onClick={() => openEdit(shift)}
                  className="px-3 py-1 text-xs border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(shift)}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${shift.active ? "border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400" : "border-green-200 text-green-700 hover:bg-green-50"}`}
                >
                  {shift.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
                {shift.type === "ROTASI" && (
                  <button
                    onClick={() => setExpandedId(expandedId === shift.id ? null : shift.id)}
                    className="px-3 py-1 text-xs border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    Unit ({shift.shiftUnits.length})
                  </button>
                )}
                <button onClick={() => handleDelete(shift)} className="px-3 py-1 text-xs text-red-600 border border-red-100 rounded-lg hover:bg-red-50">Hapus</button>
              </div>
            </div>

            {expandedId === shift.id && shift.type === "ROTASI" && (
              <div className="border-t border-gray-100 dark:border-slate-700 px-5 py-4 bg-gray-50 dark:bg-slate-900">
                <p className="text-xs font-semibold text-gray-600 dark:text-slate-400 mb-3">Unit Kerja yang Menggunakan Shift Ini</p>
                {shift.shiftUnits.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">Belum ada unit yang ditugaskan.</p>
                )}
                <div className="flex flex-wrap gap-2 mb-4">
                  {shift.shiftUnits.map((su) => (
                    <span key={su.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg text-xs text-gray-700 dark:text-slate-300">
                      {su.workUnit.name}
                      <button onClick={() => handleRemoveUnit(shift.id, su.workUnitId)} className="text-gray-400 dark:text-slate-500 hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <select
                    value={addUnitId}
                    onChange={(e) => setAddUnitId(e.target.value)}
                    className={`${inputClass} flex-1 max-w-xs`}
                    onClick={() => { setExpandedId(shift.id); setAddUnitError("") }}
                  >
                    <option value="">— Pilih unit —</option>
                    {units.filter((u) => !shift.shiftUnits.some((su) => su.workUnitId === u.id)).map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <button onClick={() => handleAddUnit(shift.id)} disabled={addingUnit} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {addingUnit ? "…" : "Tambah"}
                  </button>
                  {addUnitError && <span className="text-xs text-red-600 dark:text-red-400">{addUnitError}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
