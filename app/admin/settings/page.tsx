"use client"

import { useEffect, useState } from "react"

interface Setting {
  key: string
  label: string
  value: string
  type: "boolean" | "number" | "float" | "unit_multiselect"
  description: string | null
  min: number | null
  max: number | null
  step: number | null
}

interface WorkUnitOption {
  id: string
  name: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [drafts, setDrafts]     = useState<Record<string, string>>({})
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState("")
  const [workUnits, setWorkUnits] = useState<WorkUnitOption[]>([])

  useEffect(() => {
    fetch("/api/v1/admin/settings")
      .then((r) => r.json())
      .then((d: { settings: Setting[] }) => {
        setSettings(d.settings)
        const init: Record<string, string> = {}
        for (const s of d.settings) init[s.key] = s.value
        setDrafts(init)
      })
      .catch(() => setGlobalError("Gagal memuat pengaturan"))
      .finally(() => setLoading(false))

    fetch("/api/v1/admin/units")
      .then((r) => r.json())
      .then((list: WorkUnitOption[]) => setWorkUnits(list))
      .catch(() => {})
  }, [])

  async function save(key: string, value: string) {
    setSaving(key)
    setErrors((p) => { const n = { ...p }; delete n[key]; return n })
    setGlobalError("")
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors((p) => ({ ...p, [key]: data.error?.message ?? "Gagal menyimpan" }))
        return
      }
      setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value } : s))
    } catch {
      setErrors((p) => ({ ...p, [key]: "Koneksi gagal" }))
    } finally {
      setSaving(null)
    }
  }

  function handleToggle(key: string, currentValue: string) {
    const next = currentValue === "true" ? "false" : "true"
    setDrafts((p) => ({ ...p, [key]: next }))
    save(key, next)
  }

  function handleNumberChange(key: string, val: string) {
    setDrafts((p) => ({ ...p, [key]: val }))
    setErrors((p) => { const n = { ...p }; delete n[key]; return n })
  }

  function handleNumberSave(setting: Setting) {
    const val = drafts[setting.key] ?? setting.value
    save(setting.key, val)
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-1">Pengaturan Sistem</h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">Konfigurasi perilaku sistem CutiSmart.</p>

      {globalError && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 rounded-lg text-sm">{globalError}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400 dark:text-slate-500">Memuat…</div>
      ) : (
        <div className="space-y-3">
          {/* Boolean toggles */}
          {settings.filter((s) => s.type === "boolean").length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
              {settings.filter((s) => s.type === "boolean").map((setting) => {
                const isOn = (drafts[setting.key] ?? setting.value) === "true"
                const isSaving = saving === setting.key
                return (
                  <div key={setting.key} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{setting.label}</p>
                      {setting.description && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">{setting.description}</p>
                      )}
                      {errors[setting.key] && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors[setting.key]}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 pt-0.5">
                      <span className={`text-xs font-medium ${isOn ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"}`}>
                        {isOn ? "Aktif" : "Nonaktif"}
                      </span>
                      <button
                        onClick={() => handleToggle(setting.key, drafts[setting.key] ?? setting.value)}
                        disabled={isSaving}
                        aria-pressed={isOn}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                          isOn ? "bg-green-500" : "bg-gray-200 dark:bg-slate-600"
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Numeric + float inputs */}
          {settings.filter((s) => s.type === "number" || s.type === "float").length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
              {settings.filter((s) => s.type === "number" || s.type === "float").map((setting) => {
                const isSaving = saving === setting.key
                const draft = drafts[setting.key] ?? setting.value
                const isDirty = draft !== setting.value
                return (
                  <div key={setting.key} className="flex items-start gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{setting.label}</p>
                      {setting.description && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">{setting.description}</p>
                      )}
                      {errors[setting.key] && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors[setting.key]}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <input
                        type="number"
                        value={draft}
                        min={setting.min ?? undefined}
                        max={setting.max ?? undefined}
                        step={setting.step ?? (setting.type === "float" ? 0.05 : 1)}
                        onChange={(e) => handleNumberChange(setting.key, e.target.value)}
                        disabled={isSaving}
                        className="w-24 px-2 py-1 text-sm text-center border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <button
                        onClick={() => handleNumberSave(setting)}
                        disabled={isSaving || !isDirty}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                      >
                        {isSaving ? "…" : "Simpan"}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Unit multi-select */}
          {settings.filter((s) => s.type === "unit_multiselect").map((setting) => {
            const isSaving = saving === setting.key
            const draft = drafts[setting.key] ?? setting.value
            let selectedIds: string[] = []
            try { const p = JSON.parse(draft); if (Array.isArray(p)) selectedIds = p as string[] } catch {}
            const isDirty = draft !== setting.value

            function toggleUnit(unitId: string) {
              const next = selectedIds.includes(unitId)
                ? selectedIds.filter((id) => id !== unitId)
                : [...selectedIds, unitId]
              setDrafts((p) => ({ ...p, [setting.key]: JSON.stringify(next) }))
              setErrors((p) => { const n = { ...p }; delete n[setting.key]; return n })
            }

            return (
              <div key={setting.key} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{setting.label}</p>
                    {setting.description && (
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">{setting.description}</p>
                    )}
                    {errors[setting.key] && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors[setting.key]}</p>
                    )}
                  </div>
                  <button
                    onClick={() => save(setting.key, draft)}
                    disabled={isSaving || !isDirty}
                    className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {isSaving ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
                {workUnits.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-slate-500">Memuat daftar unit…</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                    {[...workUnits].sort((a, b) => a.name.localeCompare(b.name)).map((u) => {
                      const checked = selectedIds.includes(u.id)
                      return (
                        <label key={u.id} className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer text-sm ${
                          checked
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            : "border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                        }`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleUnit(u.id)} className="rounded" />
                          <span className="truncate">{u.name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                <p className="mt-3 text-[11px] text-gray-400 dark:text-slate-500">
                  {selectedIds.length} unit dipilih.
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
