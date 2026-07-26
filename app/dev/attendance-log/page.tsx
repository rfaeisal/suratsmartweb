"use client"

import { useEffect, useState, useCallback } from "react"

type Record = {
  id: string
  fullName: string
  nip: string
  eventType: string
  recordedAt: string
  tanggalKerja: string
  room: string | null
  status: string
  telat: boolean
  beaconDetected: boolean
  flags: string[]
}

const EVENT_COLORS: Record<string, string> = {
  MASUK:        "#22c55e",
  PULANG:       "#3b82f6",
  LEMBUR_MASUK: "#f59e0b",
  LEMBUR_PULANG:"#8b5cf6",
}

const EVENT_LABELS: Record<string, string> = {
  MASUK:        "MASUK",
  PULANG:       "PULANG",
  LEMBUR_MASUK: "LBR MASUK",
  LEMBUR_PULANG:"LBR PULANG",
}

function toWib(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

export default function AttendanceLogPage() {
  const [records, setRecords]   = useState<Record[]>([])
  const [loading, setLoading]   = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [newIds, setNewIds]     = useState<Set<string>>(new Set())

  const fetch_ = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch("/api/v1/dev/attendance-log?limit=100", { cache: "no-store" })
      if (!res.ok) return
      const json = await res.json()
      setRecords((prev) => {
        const prevIds = new Set(prev.map((r) => r.id))
        const incoming: Record[] = json.data
        const fresh = incoming.filter((r) => !prevIds.has(r.id)).map((r) => r.id)
        if (fresh.length) {
          setNewIds(new Set(fresh))
          setTimeout(() => setNewIds(new Set()), 3000)
        }
        return incoming
      })
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const id = setInterval(() => fetch_(true), 2000)
    return () => clearInterval(id)
  }, [fetch_])

  const s: Record<string, React.CSSProperties> = {
    page:    { minHeight: "100vh", background: "#0f172a", color: "#f1f5f9", fontFamily: "monospace", padding: "2rem" },
    header:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" },
    title:   { fontSize: "1rem", fontWeight: 700, color: "#e2e8f0" },
    sub:     { fontSize: "0.7rem", color: "#475569", marginTop: "2px" },
    badge:   { background: "#1e293b", borderRadius: "6px", padding: "0.25rem 0.75rem", fontSize: "0.7rem", color: "#64748b" },
    table:   { width: "100%", borderCollapse: "collapse" as const, fontSize: "0.75rem" },
    th:      { textAlign: "left" as const, padding: "0.5rem 0.75rem", color: "#64748b", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap" as const },
    empty:   { textAlign: "center" as const, padding: "3rem", color: "#334155" },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Dev Tools — Log Absensi</div>
          <div style={s.sub}>
            {lastRefresh ? `Refresh terakhir: ${lastRefresh.toLocaleTimeString("id-ID")} · auto setiap 2s` : "Memuat..."}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={s.badge}>{records.length} record</span>
          <button
            onClick={() => fetch_()}
            style={{ background: "#1e40af", color: "#fff", border: "none", borderRadius: "6px", padding: "0.35rem 0.85rem", cursor: "pointer", fontSize: "0.75rem" }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" as const, borderRadius: "10px", border: "1px solid #1e293b" }}>
        <table style={s.table}>
          <thead>
            <tr style={{ background: "#0f172a" }}>
              <th style={s.th}>Waktu (WIB)</th>
              <th style={s.th}>Nama</th>
              <th style={s.th}>NIP</th>
              <th style={s.th}>Event</th>
              <th style={s.th}>Ruang</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Telat</th>
              <th style={s.th}>Beacon</th>
              <th style={s.th}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr><td colSpan={9} style={s.empty}>Memuat...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={9} style={s.empty}>Belum ada record absensi.</td></tr>
            ) : records.map((r) => {
              const isNew = newIds.has(r.id)
              return (
                <tr
                  key={r.id}
                  style={{
                    background: isNew ? "#0c2a1a" : "transparent",
                    borderBottom: "1px solid #1e293b",
                    transition: "background 0.5s",
                  }}
                >
                  <td style={{ padding: "0.5rem 0.75rem", color: "#94a3b8", whiteSpace: "nowrap" }}>{toWib(r.recordedAt)}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#e2e8f0", fontWeight: 600 }}>{r.fullName}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#64748b" }}>{r.nip}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <span style={{
                      background: (EVENT_COLORS[r.eventType] ?? "#64748b") + "22",
                      color: EVENT_COLORS[r.eventType] ?? "#64748b",
                      borderRadius: "4px", padding: "0.15rem 0.5rem", fontWeight: 700, fontSize: "0.7rem",
                    }}>
                      {EVENT_LABELS[r.eventType] ?? r.eventType}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "#94a3b8" }}>{r.room ?? "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <span style={{ color: r.status === "VALID" ? "#22c55e" : "#ef4444" }}>{r.status}</span>
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                    {r.telat ? <span style={{ color: "#f87171" }}>✓</span> : <span style={{ color: "#334155" }}>—</span>}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                    {r.beaconDetected ? <span style={{ color: "#22c55e" }}>✓</span> : <span style={{ color: "#334155" }}>—</span>}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    {(r.flags as string[]).length > 0
                      ? (r.flags as string[]).map((f) => (
                          <span key={f} style={{ background: "#1e293b", borderRadius: "3px", padding: "0.1rem 0.4rem", marginRight: "4px", color: "#f59e0b", fontSize: "0.65rem" }}>{f}</span>
                        ))
                      : <span style={{ color: "#334155" }}>—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
