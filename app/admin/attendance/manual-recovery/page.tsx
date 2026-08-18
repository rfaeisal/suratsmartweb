"use client"

import { useEffect, useState } from "react"
import { SearchableSelect } from "@/components/SearchableSelect"

interface EmployeeOption {
  id: string
  fullName: string
  nip: string
}

interface DeviceOption {
  id: string
  nama: string | null
  deviceId: string
  roomName: string | null
}

const EVENT_TYPES = [
  { value: "MASUK", label: "Masuk" },
  { value: "PULANG", label: "Pulang" },
  { value: "LEMBUR_MASUK", label: "Lembur Masuk" },
  { value: "LEMBUR_PULANG", label: "Lembur Pulang" },
]

function nowLocalDatetime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ManualRecoveryPage() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [employeeId, setEmployeeId] = useState("")
  const [eventType, setEventType] = useState<string>("MASUK")
  const [recordedAt, setRecordedAt] = useState(nowLocalDatetime())
  const [deviceId, setDeviceId] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/v1/admin/employees?activeOnly=true&perPage=1000")
      .then((r) => r.json())
      .then((d) => setEmployees(d.data.map((e: EmployeeOption) => ({ id: e.id, fullName: e.fullName, nip: e.nip }))))
      .catch(() => {})

    fetch("/api/v1/devices")
      .then((r) => r.json())
      .then((d) => {
        // Endpoint devices return { data: [...] } atau raw list — cek shape.
        const list = Array.isArray(d) ? d : (d.data ?? [])
        setDevices(list.map((dv: { id: string; nama: string | null; device_id: string; deviceId?: string; room?: { nama: string } | null }) => ({
          id: dv.id,
          nama: dv.nama,
          deviceId: dv.device_id ?? dv.deviceId ?? "",
          roomName: dv.room?.nama ?? null,
        })))
      })
      .catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!employeeId || !eventType || !recordedAt || reason.trim().length < 3) {
      setMessage({ type: "error", text: "Lengkapi pegawai, waktu, dan alasan (min 3 char)" })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/v1/admin/attendance/manual-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          eventType,
          recordedAt: new Date(recordedAt).toISOString(),
          deviceId: deviceId || undefined,
          reason: reason.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? "Gagal simpan")
      setMessage({ type: "success", text: `Berhasil simpan absen manual: ${data.eventType} ${data.tanggalKerja}` })
      // Reset form (kecuali pegawai)
      setReason("")
      setRecordedAt(nowLocalDatetime())
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Terjadi kesalahan" })
    } finally {
      setSubmitting(false)
    }
  }

  const empOptions = employees.map((e) => ({ value: e.id, label: e.fullName, sub: e.nip }))
  const deviceOptions = devices.map((d) => ({
    value: d.id,
    label: d.nama ?? d.deviceId,
    sub: d.roomName ?? d.deviceId,
  }))

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">Manual Recovery Absen</h1>
      <p className="text-xs text-gray-500 dark:text-slate-400 mb-5">
        Input absensi manual untuk kasus outage jaringan / device rusak / pegawai lapor manual.
        Tersimpan sebagai <code className="text-xs">MANUAL_RECOVERY</code> — terpisah dari absen normal, terlihat di audit log.
      </p>

      <form onSubmit={submit} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-5 max-w-xl space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Pegawai</label>
          <SearchableSelect
            options={empOptions}
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="Cari pegawai…"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Jenis Absen</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {EVENT_TYPES.map((et) => (
              <option key={et.value} value={et.value}>{et.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Waktu Absen</label>
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Perangkat (opsional)</label>
          <SearchableSelect
            options={deviceOptions}
            value={deviceId}
            onChange={setDeviceId}
            placeholder="Pilih device tempat absen…"
            allowEmpty
            emptyLabel="— Tidak spesifik (auto-pilih) —"
          />
          <p className="mt-1 text-[10px] text-gray-400 dark:text-slate-500">
            Kalau tidak tahu di mesin mana, biarkan kosong — sistem akan pilih otomatis untuk memenuhi constraint DB.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Alasan (wajib)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Contoh: Outage jaringan RS 08:00–08:30. Pegawai lapor absen ke bagian kepegawaian."
          />
        </div>

        {message && (
          <div className={`px-3 py-2 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          }`}>{message.text}</div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Menyimpan…" : "Simpan Absen Manual"}
          </button>
        </div>
      </form>
    </div>
  )
}
