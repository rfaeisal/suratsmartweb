"use client"

import { useState } from "react"
import Link from "next/link"
import { Tooltip } from "@/components/Tooltip"
import { SearchableSelect } from "@/components/SearchableSelect"

interface WorkUnit {
  id: string
  name: string
  parentId: string | null
  parent: { id: string; name: string } | null
  _count: { employees: number }
}

interface Props {
  initial: WorkUnit[]
}

export default function UnitsClient({ initial }: Props) {
  const [units, setUnits] = useState<WorkUnit[]>(initial)
  const [newName, setNewName] = useState("")
  const [newParentId, setNewParentId] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

  const [search, setSearch] = useState("")

  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editParentId, setEditParentId] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})

  const inputClass =
    "px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError("")
    if (!newName.trim()) { setAddError("Nama unit wajib diisi"); return }
    setAdding(true)
    try {
      const res = await fetch("/api/v1/admin/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), parentId: newParentId || null }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error?.message ?? "Gagal menyimpan"); return }
      const newUnit: WorkUnit = { ...data, parent: units.find((u) => u.id === data.parentId) ?? null, _count: { employees: 0 } }
      setUnits((prev) => [...prev, newUnit].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName("")
      setNewParentId("")
    } catch { setAddError("Koneksi gagal") }
    finally { setAdding(false) }
  }

  function startEdit(unit: WorkUnit) {
    setEditId(unit.id)
    setEditName(unit.name)
    setEditParentId(unit.parentId ?? "")
    setEditError("")
  }

  async function handleSave(id: string) {
    setEditError("")
    if (!editName.trim()) { setEditError("Nama wajib diisi"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/admin/units/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), parentId: editParentId || null }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error?.message ?? "Gagal menyimpan"); return }
      setUnits((prev) =>
        prev
          .map((u) => (u.id === id ? { ...u, name: data.name, parentId: data.parentId, parent: data.parent } : u))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditId(null)
    } catch { setEditError("Koneksi gagal") }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus unit "${name}"?`)) return
    setDeleteErrors((prev) => { const next = { ...prev }; delete next[id]; return next })
    const res = await fetch(`/api/v1/admin/units/${id}`, { method: "DELETE" })
    if (res.ok) {
      setUnits((prev) => prev.filter((u) => u.id !== id))
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteErrors((prev) => ({ ...prev, [id]: data.error?.message ?? "Gagal menghapus" }))
    }
  }

  const parentOptions = units.filter((u) => u.id !== editId)
  const filteredUnits = units.filter((u) =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.parent?.name ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Form tambah */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Tambah Unit Kerja Baru</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Unit <span className="text-red-500">*</span></label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="misal: Instalasi Farmasi"
              className={`${inputClass} w-full`}
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Induk <span className="text-gray-400 font-normal">(opsional)</span></label>
            <SearchableSelect
              options={units.map((u) => ({ value: u.id, label: u.name }))}
              value={newParentId}
              onChange={setNewParentId}
              placeholder="Cari unit induk…"
              allowEmpty
              emptyLabel="— Tidak ada (root) —"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? "Menyimpan…" : "Tambah"}
          </button>
          {addError && <p className="text-xs text-red-600 w-full">{addError}</p>}
        </form>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {units.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-200">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama unit kerja…"
              className={`${inputClass} w-64`}
            />
          </div>
        )}
        {units.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">Belum ada unit kerja. Tambahkan di atas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Induk</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Pegawai</th>
                <th className="px-4 py-3 w-36"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                    Tidak ada unit yang cocok dengan &ldquo;{search}&rdquo;.
                  </td>
                </tr>
              ) : filteredUnits.map((unit) => (
                <tr key={unit.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    {editId === unit.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`${inputClass} w-full`}
                        autoFocus
                      />
                    ) : (
                      <Link
                        href={`/admin/units/${unit.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {unit.name}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editId === unit.id ? (
                      <SearchableSelect
                        options={parentOptions.map((u) => ({ value: u.id, label: u.name }))}
                        value={editParentId}
                        onChange={setEditParentId}
                        placeholder="Cari unit induk…"
                        allowEmpty
                        emptyLabel="— Tidak ada (root) —"
                      />
                    ) : (
                      <span className="text-gray-500">
                        {unit.parent ? (
                          <Link href={`/admin/units/${unit.parent.id}`} className="text-gray-600 hover:text-blue-600">
                            {unit.parent.name}
                          </Link>
                        ) : (
                          <span className="italic text-gray-400">Root</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/units/${unit.id}`}
                      className="inline-flex items-center gap-1 text-gray-700 hover:text-blue-600"
                    >
                      <span className="font-medium">{unit._count.employees}</span>
                      <span className="text-xs text-gray-400">pegawai</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {editId === unit.id ? (
                      <div className="flex gap-2 items-center justify-end">
                        {editError && <span className="text-xs text-red-600 mr-1">{editError}</span>}
                        <Tooltip label="Simpan">
                          <button
                            onClick={() => handleSave(unit.id)}
                            disabled={saving}
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </button>
                        </Tooltip>
                        <Tooltip label="Batal">
                          <button
                            onClick={() => setEditId(null)}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </Tooltip>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end items-center">
                        {deleteErrors[unit.id] && (
                          <span className="text-xs text-red-600 mr-1">{deleteErrors[unit.id]}</span>
                        )}
                        <Tooltip label="Edit">
                          <button
                            onClick={() => startEdit(unit)}
                            className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        </Tooltip>
                        <Tooltip label="Hapus">
                          <button
                            onClick={() => handleDelete(unit.id, unit.name)}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </Tooltip>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
