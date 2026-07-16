"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Tooltip } from "@/components/Tooltip"
import { SearchableSelect } from "@/components/SearchableSelect"

interface UnitOption {
  id: string
  name: string
}

interface EmployeeOption {
  id: string
  fullName: string
  positionTitle: string | null
}

interface Props {
  unit: {
    id: string
    name: string
    parentId: string | null
    kepalaRuanganId: string | null
    kepalaRuangan: { id: string; fullName: string; positionTitle: string | null } | null
    parent: { id: string; name: string } | null
    _count: { employees: number; children: number }
  }
  allUnits: UnitOption[]
  allEmployees: EmployeeOption[]
}

export default function UnitDetailActions({ unit, allUnits, allEmployees }: Props) {
  const router = useRouter()

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(unit.name)
  const [editParentId, setEditParentId] = useState(unit.parentId ?? "")
  const [editKepalaId, setEditKepalaId] = useState(unit.kepalaRuanganId ?? "")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")

  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const parentOptions = allUnits.filter((u) => u.id !== unit.id)

  async function handleSave() {
    if (!editName.trim()) { setEditError("Nama wajib diisi"); return }
    setSaving(true)
    setEditError("")
    try {
      const res = await fetch(`/api/v1/admin/units/${unit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          parentId: editParentId || null,
          kepalaRuanganId: editKepalaId || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setEditError(d.error?.message ?? "Gagal menyimpan")
        return
      }
      setEditOpen(false)
      router.refresh()
    } catch {
      setEditError("Koneksi gagal")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (unit._count.employees > 0) {
      setDeleteError(`Unit masih memiliki ${unit._count.employees} pegawai. Pindahkan pegawai terlebih dahulu.`)
      return
    }
    if (unit._count.children > 0) {
      setDeleteError("Unit masih memiliki sub-unit. Hapus sub-unit terlebih dahulu.")
      return
    }
    if (!confirm(`Hapus unit "${unit.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setDeleting(true)
    setDeleteError("")
    try {
      const res = await fetch(`/api/v1/admin/units/${unit.id}`, { method: "DELETE" })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setDeleteError(d.error?.message ?? "Gagal menghapus")
        return
      }
      router.push("/admin/units")
    } catch {
      setDeleteError("Koneksi gagal")
    } finally {
      setDeleting(false)
    }
  }

  const inputClass = "w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/admin/units"
          className="mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{unit.name}</h1>
            <Tooltip label="Edit">
              <button
                onClick={() => { setEditName(unit.name); setEditParentId(unit.parentId ?? ""); setEditKepalaId(unit.kepalaRuanganId ?? ""); setEditOpen(true) }}
                className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </Tooltip>
            <Tooltip label="Hapus">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </Tooltip>
          </div>
          {deleteError && <p className="mt-1 text-xs text-red-600">{deleteError}</p>}
          <p className="text-sm text-gray-500 mt-0.5">
            {unit.parent ? (
              <>Sub-unit dari <Link href={`/admin/units/${unit.parent.id}`} className="text-blue-600 hover:underline">{unit.parent.name}</Link></>
            ) : (
              "Unit kerja root"
            )}
          </p>
        </div>
      </div>

      {/* Modal Edit */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Edit Unit Kerja</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nama Unit <span className="text-red-500">*</span>
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Unit Induk</label>
                <SearchableSelect
                  options={parentOptions.map((u) => ({ value: u.id, label: u.name }))}
                  value={editParentId}
                  onChange={setEditParentId}
                  placeholder="Cari unit induk…"
                  allowEmpty
                  emptyLabel="— Tidak ada (root) —"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Kepala Ruangan
                  <span className="ml-1 text-gray-400 font-normal">(opsional)</span>
                </label>
                <SearchableSelect
                  options={allEmployees.map((e) => ({ value: e.id, label: e.fullName, sub: e.positionTitle ?? "" }))}
                  value={editKepalaId}
                  onChange={setEditKepalaId}
                  placeholder="Cari nama kepala ruangan…"
                  allowEmpty
                  emptyLabel="— Tidak ada —"
                />
              </div>
            </div>
            {editError && <p className="mt-2 text-xs text-red-600">{editError}</p>}
            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
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
