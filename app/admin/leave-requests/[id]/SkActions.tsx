"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Props {
  leaveRequestId: string
  currentStatus: string
  hasSkDocument: boolean
  skNumber?: string
}

export default function SkActions({ leaveRequestId, currentStatus, hasSkDocument, skNumber }: Props) {
  const router = useRouter()
  const [loadingGenerate, setLoadingGenerate] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const canGenerate = currentStatus === "APPROVED" || hasSkDocument

  async function handleGenerateSk() {
    setError("")
    setMessage("")
    setLoadingGenerate(true)
    try {
      const res = await fetch(`/api/v1/admin/leave-requests/${leaveRequestId}/generate-sk`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? "Gagal generate SK")
      setMessage(`SK berhasil digenerate: ${data.skNumber}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan")
    } finally {
      setLoadingGenerate(false)
    }
  }

return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {message && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">{message}</div>
      )}

      <div className="flex flex-wrap gap-3">
        {/* Generate / Cetak Ulang SK */}
        {canGenerate && (
          <button
            onClick={handleGenerateSk}
            disabled={loadingGenerate}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loadingGenerate
              ? "Generating..."
              : hasSkDocument
              ? "Cetak Ulang SK"
              : "Generate SK PDF"}
          </button>
        )}

        {/* Download SK */}
        {hasSkDocument && (
          <a
            href={`/api/v1/admin/leave-requests/${leaveRequestId}/sk/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Download SK PDF
          </a>
        )}

      </div>

      {hasSkDocument && skNumber && (
        <p className="text-xs text-gray-400">Nomor SK: {skNumber}</p>
      )}
    </div>
  )
}
