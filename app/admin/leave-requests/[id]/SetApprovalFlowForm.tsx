"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Employee {
  id: string
  fullName: string
  positionTitle: string | null
  unit: { name: string }
}

interface Props {
  leaveRequestId: string
  employees: Employee[]
}

interface StepRow {
  employeeId: string
  roleLabel: string
}

export default function SetApprovalFlowForm({ leaveRequestId, employees }: Props) {
  const router = useRouter()
  const [steps, setSteps] = useState<StepRow[]>([{ employeeId: "", roleLabel: "" }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

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
      if (!s.employeeId || !s.roleLabel.trim()) {
        setError("Semua baris harus diisi: pilih approver dan label jabatan")
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
              <select
                value={step.employeeId}
                onChange={(e) => updateStep(idx, "employeeId", e.target.value)}
                required
                className={inputClass}
              >
                <option value="">— Pilih approver —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}{emp.positionTitle ? ` — ${emp.positionTitle}` : ""} ({emp.unit.name})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={step.roleLabel}
                onChange={(e) => updateStep(idx, "roleLabel", e.target.value)}
                placeholder="Label jabatan (mis. Kepala Seksi)"
                required
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
