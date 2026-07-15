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
                      <div className="flex gap-2 justify-end">
                        {editError && <span className="text-xs text-red-600 mr-1">{editError}</span>}
                        <button
                          onClick={() => handleSave(pos.id)}
                          disabled={saving}
                          className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                        >
                          {saving ? "Menyimpan…" : "Simpan"}
                        </button>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-3 justify-end">
                        <button onClick={() => startEdit(pos)} className="text-xs text-blue-600 hover:underline">
                          Edit
                        </button>
                        <button onClick={() => toggleActive(pos)} className="text-xs text-gray-500 hover:underline">
                          {pos.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button onClick={() => handleDelete(pos.id)} className="text-xs text-red-400 hover:text-red-600 hover:underline">
                          Hapus
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
