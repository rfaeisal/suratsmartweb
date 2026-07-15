"use client"

import { useState } from "react"

interface Position {
  id: string
  name: string
  level: number
  isActive: boolean
}

interface Props {
  initial: Position[]
}

export default function PositionsClient({ initial }: Props) {
  const [positions, setPositions] = useState<Position[]>(initial)
  const [newName, setNewName] = useState("")
  const [newLevel, setNewLevel] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")

  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editLevel, setEditLevel] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")

  const inputClass =
    "px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError("")
    if (!newName.trim() || !newLevel) { setAddError("Nama dan level wajib diisi"); return }
    setAdding(true)
    try {
      const res = await fetch("/api/v1/admin/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), level: Number(newLevel) }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error?.message ?? "Gagal menyimpan"); return }
      setPositions((prev) => [...prev, data].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)))
      setNewName("")
      setNewLevel("")
    } catch { setAddError("Koneksi gagal") }
    finally { setAdding(false) }
  }

  function startEdit(pos: Position) {
    setEditId(pos.id)
    setEditName(pos.name)
    setEditLevel(String(pos.level))
    setEditError("")
  }

  async function handleSave(id: string) {
    setEditError("")
    if (!editName.trim() || !editLevel) { setEditError("Nama dan level wajib diisi"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/admin/positions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), level: Number(editLevel) }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error?.message ?? "Gagal menyimpan"); return }
      setPositions((prev) =>
        prev.map((p) => (p.id === id ? data : p)).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
      )
      setEditId(null)
    } catch { setEditError("Koneksi gagal") }
    finally { setSaving(false) }
  }

  async function toggleActive(pos: Position) {
    const res = await fetch(`/api/v1/admin/positions/${pos.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !pos.isActive }),
    })
    if (res.ok) {
      const data = await res.json()
      setPositions((prev) => prev.map((p) => (p.id === pos.id ? data : p)))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus jabatan ini?")) return
    const res = await fetch(`/api/v1/admin/positions/${id}`, { method: "DELETE" })
    if (res.ok) setPositions((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* Form tambah */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Tambah Jabatan Baru</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nama Jabatan</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Contoh: Kepala Sub-Bagian Keuangan"
              className={`${inputClass} w-72`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Level <span className="text-gray-400 font-normal">(angka lebih besar = lebih tinggi)</span>
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
              placeholder="mis. 5"
              className={`${inputClass} w-24`}
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
        {positions.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">Belum ada jabatan. Tambahkan di atas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama Jabatan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Level</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Status</th>
                <th className="px-4 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {positions.map((pos) => (
                <tr key={pos.id} className={`hover:bg-gray-50 transition-colors ${!pos.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    {editId === pos.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`${inputClass} w-full`}
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium text-gray-900">{pos.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editId === pos.id ? (
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={editLevel}
                        onChange={(e) => setEditLevel(e.target.value)}
                        className={`${inputClass} w-20`}
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                        {pos.level}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${pos.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {pos.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editId === pos.id ? (
                      <div className="flex gap-2 justify-end items-center">
                        {editError && <span className="text-xs text-red-600 mr-1">{editError}</span>}
                        <button
                          onClick={() => handleSave(pos.id)}
                          disabled={saving}
                          title="Simpan"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          title="Batal"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => startEdit(pos)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleActive(pos)}
                          title={pos.isActive ? "Nonaktifkan" : "Aktifkan"}
                          className={`p-1.5 rounded-lg transition-colors ${pos.isActive ? "text-amber-500 hover:text-amber-700 hover:bg-amber-50" : "text-green-500 hover:text-green-700 hover:bg-green-50"}`}
                        >
                          {pos.isActive ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(pos.id)}
                          title="Hapus"
                          className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
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
