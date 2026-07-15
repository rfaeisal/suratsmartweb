"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { SearchableSelect, type SelectOption } from "@/components/SearchableSelect"

interface Employee {
  id: string
  fullName: string
  positionTitle: string | null
  unit: { name: string } | null
}

interface Props {
  leaveRequestId: string
  employees: Employee[]
  noChain?: boolean
}

interface StepRow {
  employeeId: string
  roleLabel: string
}

// ── Form utama ────────────────────────────────────────────────────────────────

export default function SetApprovalFlowForm({ leaveRequestId, employees, noChain }: Props) {
  const router = useRouter()
  const [steps, setSteps] = useState<StepRow[]>([{ employeeId: "", roleLabel: "" }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const options: SelectOption[] = employees.map((emp) => ({
    value: emp.id,
    label: emp.fullName,
    sub: [emp.positionTitle, emp.unit?.name].filter(Boolean).join(" — "),
  }))

  function addStep() {
    setSteps((prev) => [...prev, { employeeId: "", roleLabel: "" }])
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateStep(idx: number, field: keyof StepRow, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    for (const s of steps) {
      if (!s.employeeId) {
        setError("Pilih approver untuk setiap langkah")
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/admin/leave-requests/${leaveRequestId}/approval-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? "Gagal menetapkan alur")
      setSuccess(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
        Alur approval berhasil ditetapkan. Pengajuan kini berstatus IN_APPROVAL.
      </div>
    )
  }

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {noChain && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          Atasan pegawai ini belum dikonfigurasi — menampilkan semua pegawai aktif sebagai pilihan approver.
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0 mt-2">
              {idx + 1}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <SearchableSelect
                options={options}
                value={step.employeeId}
                onChange={(val) => {
                  const emp = employees.find((e) => e.id === val)
                  setSteps((prev) =>
                    prev.map((s, i) =>
                      i === idx
                        ? { employeeId: val, roleLabel: emp?.positionTitle ?? s.roleLabel }
                        : s
                    )
                  )
                }}
                placeholder="Cari nama atau jabatan…"
              />
              <input
                type="text"
                value={step.roleLabel}
                onChange={(e) => updateStep(idx, "roleLabel", e.target.value)}
                placeholder="Label jabatan (opsional)"
                maxLength={100}
                className={inputClass}
              />
            </div>
            {steps.length > 1 && (
              <button
                type="button"
                onClick={() => removeStep(idx)}
                className="mt-2 text-red-400 hover:text-red-600 text-sm"
                title="Hapus langkah"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={addStep}
          disabled={steps.length >= 10}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          + Tambah Langkah
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Menetapkan..." : "Tetapkan Alur Approval"}
        </button>
      </div>
    </form>
  )
}
