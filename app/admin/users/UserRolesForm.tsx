"use client"

import { useState } from "react"

interface Props {
  userId: string
  currentRoles: string[]
  allRoles: readonly string[]
}

export default function UserRolesForm({ userId, currentRoles, allRoles }: Props) {
  const [selected, setSelected] = useState<string[]>(currentRoles)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function toggle(role: string) {
    if (role === "PEGAWAI") return
    setSelected((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
    setMsg(null)
  }

  async function save() {
    if (selected.length === 0) {
      setMsg({ ok: false, text: "Minimal 1 role harus dipilih" })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: selected }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMsg({ ok: false, text: data.message ?? "Gagal menyimpan" })
      } else {
        setMsg({ ok: true, text: "Tersimpan" })
      }
    } catch {
      setMsg({ ok: false, text: "Koneksi gagal" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 shrink-0">
      <div className="flex flex-wrap gap-2 justify-end">
        {allRoles.map((role) => {
          const locked = role === "PEGAWAI"
          return (
            <label key={role} className={`flex items-center gap-1.5 select-none ${locked ? "cursor-default opacity-60" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={selected.includes(role)}
                onChange={() => toggle(role)}
                disabled={locked}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-default"
              />
              <span className="text-xs text-gray-700">{role}</span>
            </label>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        {msg && (
          <span className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>
            {msg.text}
          </span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  )
}
