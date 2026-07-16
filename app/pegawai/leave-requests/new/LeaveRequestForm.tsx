"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"

interface LeaveTypeOption {
  id: string
  code: string
  name: string
  requiresAttachment: boolean
  remainingDays: number | null
  hasQuota: boolean
}

interface Colleague {
  id: string
  fullName: string
  positionTitle: string | null
}

interface Props {
  leaveTypes: LeaveTypeOption[]
  colleagues: Colleague[]
}

export default function LeaveRequestForm({ leaveTypes, colleagues }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const [leaveTypeId, setLeaveTypeId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")
  const [addressDuringLeave, setAddressDuringLeave] = useState("")
  const [emergencyPhone, setEmergencyPhone] = useState("")
  const [delegateId, setDelegateId] = useState("")
  const [files, setFiles] = useState<File[]>([])

  const selectedType = leaveTypes.find((lt) => lt.id === leaveTypeId)

  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return null
    const s = new Date(startDate)
    const e = new Date(endDate)
    if (e < s) return null
    return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }, [startDate, endDate])

  const quotaWarning = useMemo(() => {
    if (!selectedType?.hasQuota || totalDays === null) return null
    if (selectedType.remainingDays === null) return null
    if (totalDays > selectedType.remainingDays) {
      return `Sisa kuota (${selectedType.remainingDays} hari) tidak cukup untuk ${totalDays} hari yang diminta`
    }
    return null
  }, [selectedType, totalDays])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!leaveTypeId || !startDate || !endDate || !reason || !delegateId) {
      setError("Semua field wajib diisi")
      return
    }

    if (quotaWarning) {
      setError(quotaWarning)
      return
    }

    setSubmitting(true)

    try {
      // 1. Upload lampiran jika ada
      const fileIds: string[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/v1/attachments", { method: "POST", body: fd })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error?.message ?? "Gagal upload file")
        }
        const { fileId } = await res.json()
        fileIds.push(fileId)
      }

      // 2. Buat pengajuan
      const res = await fetch("/api/v1/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId,
          startDate,
          endDate,
          reason,
          addressDuringLeave: addressDuringLeave || undefined,
          emergencyPhone: emergencyPhone || undefined,
          delegateEmployeeId: delegateId,
          attachmentFileIds: fileIds,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Gagal mengajukan cuti")
      }

      router.push(`/pegawai/leave-requests/${data.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan")
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Jenis Cuti */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Jenis Cuti <span className="text-red-500">*</span>
        </label>
        <select
          value={leaveTypeId}
          onChange={(e) => { setLeaveTypeId(e.target.value); setFiles([]) }}
          required
          className={inputClass}
        >
          <option value="">— Pilih jenis cuti —</option>
          {leaveTypes.map((lt) => (
            <option key={lt.id} value={lt.id}>
              {lt.name}
              {lt.hasQuota && lt.remainingDays !== null ? ` (sisa ${lt.remainingDays} hari)` : ""}
              {lt.hasQuota && lt.remainingDays === null ? " (kuota belum diatur)" : ""}
            </option>
          ))}
        </select>
        {selectedType?.requiresAttachment && (
          <p className="mt-1 text-xs text-amber-600">
            * Jenis cuti ini wajib menyertakan lampiran (misal surat dokter)
          </p>
        )}
      </div>

      {/* Tanggal */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tanggal Mulai <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            min={new Date().toISOString().split("T")[0]}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tanggal Selesai <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            min={startDate || new Date().toISOString().split("T")[0]}
            className={inputClass}
          />
        </div>
      </div>

      {totalDays !== null && (
        <div
          className={`px-3 py-2 rounded-lg text-sm font-medium ${
            quotaWarning ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
          }`}
        >
          {quotaWarning ?? `Total: ${totalDays} hari kalender`}
        </div>
      )}

      {/* Alasan */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Alasan <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          placeholder="Tuliskan alasan pengajuan cuti..."
          className={inputClass}
        />
      </div>

      {/* Alamat selama cuti */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Alamat Selama Cuti <span className="text-gray-400 text-xs font-normal">(opsional)</span>
        </label>
        <textarea
          value={addressDuringLeave}
          onChange={(e) => setAddressDuringLeave(e.target.value)}
          rows={2}
          placeholder="Contoh: Jl. Mawar No. 5, Kel. Sukamaju, Kec. Cilandak, Jakarta Selatan"
          className={inputClass}
        />
      </div>

      {/* Nomor Kontak Darurat */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          No. Kontak Darurat Selama Cuti{" "}
          <span className="text-gray-400 text-xs font-normal">(opsional)</span>
        </label>
        <input
          type="tel"
          value={emergencyPhone}
          onChange={(e) => setEmergencyPhone(e.target.value)}
          placeholder="Contoh: 08123456789"
          maxLength={20}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-400">
          Nomor yang bisa dihubungi selama cuti berlangsung
        </p>
      </div>

      {/* Pegawai Pengganti */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pegawai Pengganti <span className="text-red-500">*</span>
        </label>
        <select
          value={delegateId}
          onChange={(e) => setDelegateId(e.target.value)}
          required
          className={inputClass}
        >
          <option value="">— Pilih pegawai pengganti (dari unit yang sama) —</option>
          {colleagues.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}{c.positionTitle ? ` — ${c.positionTitle}` : ""}
            </option>
          ))}
        </select>
        {colleagues.length === 0 && (
          <p className="mt-1 text-xs text-gray-400">
            Tidak ada pegawai lain di unit Anda yang dapat dijadikan pengganti.
          </p>
        )}
      </div>

      {/* Lampiran */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Lampiran{selectedType?.requiresAttachment ? <span className="text-red-500"> *</span> : " (opsional)"}
        </label>
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          required={selectedType?.requiresAttachment}
          className="w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="text-xs text-gray-500">
                {f.name} ({(f.size / 1024).toFixed(0)} KB)
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-gray-400">Format: PDF, JPG, PNG. Maks 5MB per file.</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={submitting || !!quotaWarning}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Mengajukan..." : "Ajukan Cuti"}
        </button>
      </div>
    </form>
  )
}
