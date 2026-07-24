"use client"

import { useState } from "react"

interface Employee { id: string; fullName: string; nip: string }
interface RosterOption { id: string; tanggalKerja: string; shiftNama: string }

interface Props {
  unitEmployees: Employee[]
  myRosters: RosterOption[]
}

export function NewSwapForm({ unitEmployees, myRosters }: Props) {
  const [targetId, setTargetId]           = useState("")
  const [myRosterId, setMyRosterId]       = useState("")
  const [targetRosters, setTargetRosters] = useState<RosterOption[]>([])
  const [targetRosterId, setTargetRosterId] = useState("")
  const [alasan, setAlasan]               = useState("")
  const [loading, setLoading]             = useState(false)
  const [loadingRosters, setLoadingRosters] = useState(false)
  const [error, setError]                 = useState("")
  const [success, setSuccess]             = useState(false)

  async function handleTargetChange(empId: string) {
    setTargetId(empId)
    setTargetRosterId("")
    setTargetRosters([])
    if (!empId) return
    setLoadingRosters(true)
    try {
      const res = await fetch(`/api/v1/rosters?employee_id=${empId}&limit=100`)
      const data = await res.json()
      const rosters: RosterOption[] = (data.data ?? []).map((r: { id: string; tanggal_kerja: string; shift?: { nama: string } }) => ({
        id: r.id,
        tanggalKerja: r.tanggal_kerja,
        shiftNama: r.shift?.nama ?? "—",
      }))
      setTargetRosters(rosters)
    } catch { setError("Gagal memuat roster pegawai tujuan") }
    finally { setLoadingRosters(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!myRosterId || !targetRosterId) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/v1/shift-swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requester_roster_id: myRosterId,
          target_roster_id: targetRosterId,
          alasan: alasan || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error?.message ?? "Gagal mengajukan permintaan"); return }
      setSuccess(true)
      setMyRosterId(""); setTargetId(""); setTargetRosterId(""); setAlasan("")
      setTargetRosters([])
      setTimeout(() => { setSuccess(false); window.location.reload() }, 1500)
    } catch { setError("Koneksi gagal") }
    finally { setLoading(false) }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">
          Permintaan tukar shift berhasil diajukan.
        </p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Roster saya */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Shift Saya yang Ingin Ditukar</label>
          <select
            value={myRosterId}
            onChange={(e) => setMyRosterId(e.target.value)}
            required
            className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Pilih jadwal saya —</option>
            {myRosters.map((r) => (
              <option key={r.id} value={r.id}>
                {formatDate(r.tanggalKerja)} — {r.shiftNama}
              </option>
            ))}
          </select>
        </div>

        {/* Pilih pegawai tujuan */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Pegawai Tujuan Tukar Shift</label>
          <select
            value={targetId}
            onChange={(e) => handleTargetChange(e.target.value)}
            required
            className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Pilih pegawai —</option>
            {unitEmployees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName} ({e.nip})</option>
            ))}
          </select>
        </div>

        {/* Roster tujuan */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Shift Tujuan yang Diterima</label>
          <select
            value={targetRosterId}
            onChange={(e) => setTargetRosterId(e.target.value)}
            required
            disabled={!targetId || loadingRosters}
            className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">
              {loadingRosters ? "Memuat…" : targetId ? "— Pilih jadwal tujuan —" : "— Pilih pegawai dulu —"}
            </option>
            {targetRosters.map((r) => (
              <option key={r.id} value={r.id}>
                {formatDate(r.tanggalKerja)} — {r.shiftNama}
              </option>
            ))}
          </select>
        </div>

        {/* Alasan */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Alasan (opsional)</label>
          <input
            type="text"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            maxLength={500}
            placeholder="Alasan pengajuan tukar shift..."
            className="px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !myRosterId || !targetRosterId}
        className="px-5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Mengajukan…" : "Ajukan Tukar Shift"}
      </button>
    </form>
  )
}

interface SwapActionProps {
  swapId: string
  role: "target" | "none"
  status: string
}

export function SwapActions({ swapId, role, status }: SwapActionProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [done, setDone]       = useState(false)

  if (done) return <span className="text-xs text-gray-400 dark:text-slate-500">Selesai</span>

  async function act(action: "accept" | "reject") {
    setLoading(action)
    try {
      const res = await fetch(`/api/v1/shift-swaps/${swapId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) { setDone(true); setTimeout(() => window.location.reload(), 800) }
    } finally { setLoading(null) }
  }

  if (role === "target" && status === "MENUNGGU_TARGET") {
    return (
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => act("accept")}
          disabled={!!loading}
          className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {loading === "accept" ? "…" : "Terima"}
        </button>
        <button
          onClick={() => act("reject")}
          disabled={!!loading}
          className="px-3 py-1 text-xs font-medium border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
        >
          {loading === "reject" ? "…" : "Tolak"}
        </button>
      </div>
    )
  }

  return null
}
