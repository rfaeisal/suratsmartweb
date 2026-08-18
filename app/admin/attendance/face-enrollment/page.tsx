"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import QRCode from "qrcode"
import { SearchableSelect } from "@/components/SearchableSelect"

type Status = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" | "EXPIRED"

interface SessionRow {
  id: string
  status: Status
  employee: { id: string; fullName: string; nip: string }
  adminId: string
  tokenExpiresAt: string
  submittedAt: string | null
  approvedAt: string | null
  approvedBy: string | null
  rejectedAt: string | null
  rejectedBy: string | null
  rejectReason: string | null
  hasThumbnail: boolean
  embeddingModelVersion: string | null
  createdAt: string
}

interface EmployeeOption {
  id: string
  fullName: string
  nip: string
}

const STATUS_BADGE: Record<Status, string> = {
  PENDING:   "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
  SUBMITTED: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
  APPROVED:  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED:  "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  EXPIRED:   "bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-700 dark:text-slate-400",
}

const STATUS_LABEL: Record<Status, string> = {
  PENDING:   "Menunggu Scan",
  SUBMITTED: "Menunggu Approve",
  APPROVED:  "Disetujui",
  REJECTED:  "Ditolak",
  EXPIRED:   "Kedaluwarsa",
}

export default function FaceEnrollmentPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [statusFilter, setStatusFilter] = useState<"" | Status>("SUBMITTED")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [reviewSession, setReviewSession] = useState<SessionRow | null>(null)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const qs = new URLSearchParams()
      if (statusFilter) qs.set("status", statusFilter)
      const res = await fetch(`/api/v1/admin/face-enrollment/sessions?${qs}`)
      if (!res.ok) throw new Error("Gagal memuat sesi")
      const data = await res.json()
      setSessions(data.data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  useEffect(() => {
    fetch("/api/v1/admin/employees?activeOnly=true&perPage=1000")
      .then((r) => r.json())
      .then((d) => setEmployees(d.data.map((e: EmployeeOption) => ({ id: e.id, fullName: e.fullName, nip: e.nip }))))
      .catch(() => {})
  }, [])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-5">Enrollment Wajah</h1>

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 dark:text-slate-500 font-medium shrink-0">Status:</span>
          {[
            { value: "", label: "Semua" },
            { value: "SUBMITTED", label: "Menunggu Approve" },
            { value: "PENDING", label: "Menunggu Scan" },
            { value: "APPROVED", label: "Disetujui" },
            { value: "REJECTED", label: "Ditolak" },
            { value: "EXPIRED", label: "Kedaluwarsa" },
          ].map((opt) => (
            <button
              key={opt.value || "all"}
              onClick={() => setStatusFilter(opt.value as "" | Status)}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                statusFilter === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="ml-auto px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            + Buat Sesi Enrollment
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400 dark:text-slate-500">Memuat…</div>
      ) : sessions.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400 dark:text-slate-500">Tidak ada sesi enrollment.</div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Pegawai</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Dibuat</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Info</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {sessions.map((s) => {
                // Sesi PENDING yang token-nya sudah lewat waktu expire → tampilkan
                // sebagai EXPIRED di UI (data DB tidak berubah — status di-EXPIRE
                // saat backend menerima submit atau admin buat sesi baru untuk
                // pegawai yang sama).
                const effectiveStatus: Status =
                  s.status === "PENDING" && new Date(s.tokenExpiresAt).getTime() < Date.now()
                    ? "EXPIRED"
                    : s.status
                return (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-slate-100">{s.employee.fullName}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{s.employee.nip}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[effectiveStatus]}`}>
                      {STATUS_LABEL[effectiveStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                    {new Date(s.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                    {effectiveStatus === "PENDING" && `Kedaluwarsa: ${new Date(s.tokenExpiresAt).toLocaleTimeString("id-ID")}`}
                    {effectiveStatus === "EXPIRED" && s.status === "PENDING" && `Kedaluwarsa sejak ${new Date(s.tokenExpiresAt).toLocaleTimeString("id-ID")}`}
                    {s.status === "SUBMITTED" && s.submittedAt && `Submitted: ${new Date(s.submittedAt).toLocaleTimeString("id-ID")}`}
                    {s.status === "APPROVED" && s.approvedAt && `Approved: ${new Date(s.approvedAt).toLocaleString("id-ID")}`}
                    {s.status === "REJECTED" && s.rejectReason && `Alasan: ${s.rejectReason}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.status === "SUBMITTED" && (
                      <button
                        onClick={() => setReviewSession(s)}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateSessionModal
          employees={employees}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchSessions() }}
        />
      )}

      {reviewSession && (
        <ReviewSessionModal
          session={reviewSession}
          onClose={() => setReviewSession(null)}
          onDone={() => { setReviewSession(null); fetchSessions() }}
        />
      )}
    </div>
  )
}

function CreateSessionModal({
  employees,
  onClose,
  onCreated,
}: {
  employees: EmployeeOption[]
  onClose: () => void
  onCreated: () => void
}) {
  const [employeeId, setEmployeeId] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [created, setCreated] = useState<{ token: string; qrPayload: string; ttlSeconds: number } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!created) return
    QRCode.toDataURL(created.qrPayload, { errorCorrectionLevel: "M", scale: 8, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setError("Gagal generate QR"))
  }, [created])

  async function submit() {
    if (!employeeId) return
    setCreating(true)
    setError("")
    try {
      const res = await fetch("/api/v1/admin/face-enrollment/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? "Gagal buat sesi")
      setCreated({ token: data.token, qrPayload: data.qrPayload, ttlSeconds: data.ttlSeconds })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan")
    } finally {
      setCreating(false)
    }
  }

  const empOptions = employees.map((e) => ({ value: e.id, label: e.fullName, sub: e.nip }))

  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl ring-1 ring-black/5 w-full max-w-md p-6">
        {!created ? (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Buat Sesi Enrollment Wajah</h3>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Pegawai</label>
            <SearchableSelect
              options={empOptions}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Cari pegawai…"
            />
            <p className="mt-3 text-[11px] text-gray-500 dark:text-slate-400">
              Token berlaku 5 menit. Pegawai scan QR pakai app CutiSmart untuk enroll.
            </p>
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700">Batal</button>
              <button onClick={submit} disabled={creating || !employeeId} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {creating ? "Membuat…" : "Buat Sesi"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Scan QR di App Pegawai</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">Berlaku {Math.round(created.ttlSeconds / 60)} menit. Setelah pegawai submit, refresh halaman ini untuk Review.</p>
            {qrDataUrl ? (
              <div className="flex justify-center py-4 bg-white rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR enrollment" className="w-64 h-64" />
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-gray-400">Rendering QR…</div>
            )}
            <p className="mt-3 text-center text-xs font-mono text-gray-500 dark:text-slate-400">Token: {created.token}</p>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={onCreated} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Selesai</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function ReviewSessionModal({
  session,
  onClose,
  onDone,
}: {
  session: SessionRow
  onClose: () => void
  onDone: () => void
}) {
  const [processing, setProcessing] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  async function approve() {
    setProcessing(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/admin/face-enrollment/sessions/${session.id}/approve`, { method: "POST" })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error?.message ?? "Gagal approve")
      }
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan")
    } finally {
      setProcessing(false)
    }
  }

  async function reject() {
    if (rejectReason.length < 3) return
    setProcessing(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/admin/face-enrollment/sessions/${session.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error?.message ?? "Gagal reject")
      }
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan")
    } finally {
      setProcessing(false)
    }
  }

  if (!mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl ring-1 ring-black/5 w-full max-w-md p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Review Enrollment Wajah</h3>
        <p className="text-sm text-gray-900 dark:text-slate-100 font-medium">{session.employee.fullName}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">{session.employee.nip}</p>

        <div className="flex justify-center py-4 bg-gray-50 dark:bg-slate-900 rounded-lg">
          {session.hasThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/admin/face-enrollment/sessions/${session.id}/thumbnail`}
              alt="Wajah pegawai"
              className="w-40 h-40 object-cover rounded-lg border border-gray-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-40 h-40 flex items-center justify-center text-xs text-gray-400">Tidak ada thumbnail</div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-gray-500 dark:text-slate-400">
          Cocokkan wajah di layar dengan pegawai yang ada di depan meja. Approve kalau sesuai.
        </p>

        {showRejectInput && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Alasan penolakan (min 3 karakter)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: Foto blur, ulangi capture"
            />
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} disabled={processing} className="px-4 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50">
            Tutup
          </button>
          {!showRejectInput ? (
            <>
              <button onClick={() => setShowRejectInput(true)} disabled={processing} className="px-4 py-1.5 text-sm border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50">
                Tolak
              </button>
              <button onClick={approve} disabled={processing} className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {processing ? "Memproses…" : "Approve"}
              </button>
            </>
          ) : (
            <button onClick={reject} disabled={processing || rejectReason.length < 3} className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {processing ? "Memproses…" : "Konfirmasi Tolak"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
