"use client"

import { useEffect, useState } from "react"

interface Setting {
  key: string
  label: string
  value: string
}

const SETTING_DESCRIPTIONS: Record<string, string> = {
  enforce_single_session:
    "Jika aktif, login dari perangkat baru akan otomatis mencabut sesi perangkat lama. Jika nonaktif, pegawai bisa login dari banyak perangkat sekaligus (berguna saat testing).",
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/v1/admin/settings")
      .then((r) => r.json())
      .then((d: { settings: Setting[] }) => setSettings(d.settings))
      .catch(() => setError("Gagal memuat pengaturan"))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(key: string, currentValue: string) {
    const newValue = currentValue === "true" ? "false" : "true"
    setSaving(key)
    setError("")
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newValue }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error?.message ?? "Gagal menyimpan")
      }
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value: newValue } : s))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Pengaturan Sistem</h1>
      <p className="text-sm text-gray-500 mb-6">Konfigurasi perilaku sistem CutiSmart.</p>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Memuat…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {settings.map((setting) => {
            const isOn = setting.value === "true"
            const isSaving = saving === setting.key
            return (
              <div key={setting.key} className="flex items-start gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{setting.label}</p>
                  {SETTING_DESCRIPTIONS[setting.key] && (
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      {SETTING_DESCRIPTIONS[setting.key]}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 pt-0.5">
                  <span className={`text-xs font-medium ${isOn ? "text-green-600" : "text-gray-400"}`}>
                    {isOn ? "Aktif" : "Nonaktif"}
                  </span>
                  <button
                    onClick={() => handleToggle(setting.key, setting.value)}
                    disabled={isSaving}
                    aria-pressed={isOn}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                      isOn ? "bg-green-500" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        isOn ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
