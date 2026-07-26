"use client"

import { useEffect, useRef, useState } from "react"

type State = "loading" | "ready" | "refreshing" | "error"

export default function DevAttendanceQrPage() {
  const [token, setToken]           = useState<string>("")
  const [expiresIn, setExpiresIn]   = useState<number>(0)
  const [interval, setInterval_]    = useState<number>(30)
  const [state, setState]           = useState<State>("loading")
  const [imgSrc, setImgSrc]         = useState<string>("")
  const [deviceId, setDeviceId]     = useState("DEV-MOCK-001")
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchQr(id = deviceId, isRefresh = false) {
    setState(isRefresh ? "refreshing" : "loading")
    try {
      const res = await fetch(`/api/v1/dev/qr-image?device_id=${encodeURIComponent(id)}`, { cache: "no-store" })
      if (!res.ok) { setState("error"); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      setImgSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
      setToken(res.headers.get("X-Token") ?? "")
      const exp = parseInt(res.headers.get("X-Expires-In") ?? "30", 10)
      const itv = parseInt(res.headers.get("X-Interval") ?? "30", 10)
      setExpiresIn(exp)
      setInterval_(itv)
      setState("ready")
      // auto-refresh saat token expire
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fetchQr(id, true), exp * 1000 + 200)
    } catch {
      setState("error")
    }
  }

  useEffect(() => {
    fetchQr()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // countdown
  const [countdown, setCountdown] = useState(0)
  useEffect(() => {
    setCountdown(expiresIn)
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [expiresIn])

  const pct = interval > 0 ? (countdown / interval) * 100 : 0
  const urgent = countdown <= 5

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#f1f5f9", fontFamily: "monospace", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", gap: "1.5rem" }}>
      <div style={{ fontSize: "0.75rem", letterSpacing: "0.15em", color: "#64748b", textTransform: "uppercase" }}>
        Dev Tools — QR Absensi
      </div>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
        Scan untuk Test Absensi
      </h1>

      {/* Device selector */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Device ID:</label>
        <input
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.8rem", width: "180px" }}
        />
        <button
          onClick={() => fetchQr(deviceId)}
          style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: "4px", padding: "0.25rem 0.75rem", cursor: "pointer", fontSize: "0.8rem" }}
        >
          Load
        </button>
      </div>

      {/* QR code */}
      <div style={{ position: "relative", background: "#fff", borderRadius: "12px", padding: "1rem", boxShadow: "0 0 0 4px #1e293b" }}>
        {state === "loading" && (
          <div style={{ width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            Memuat...
          </div>
        )}
        {state === "error" && (
          <div style={{ width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444", textAlign: "center", fontSize: "0.8rem" }}>
            Gagal memuat QR.<br />Pastikan device mock sudah diseed.
          </div>
        )}
        {(state === "ready" || state === "refreshing") && imgSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt="QR Token Absensi"
            width={200}
            height={200}
            style={{ display: "block", opacity: state === "refreshing" ? 0.4 : 1, transition: "opacity 0.2s" }}
          />
        )}
      </div>

      {/* Countdown bar */}
      {state === "ready" || state === "refreshing" ? (
        <div style={{ width: 232, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: urgent ? "#f87171" : "#94a3b8" }}>
            <span>{urgent ? "⚠ Segera expire" : "Berlaku"}</span>
            <span style={{ fontWeight: 700 }}>{countdown}s</span>
          </div>
          <div style={{ background: "#1e293b", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: urgent ? "#ef4444" : "#22c55e", transition: "width 1s linear, background 0.3s" }} />
          </div>
          <div style={{ fontSize: "0.65rem", color: "#475569", textAlign: "center" }}>
            Auto-refresh setiap {interval}s
          </div>
        </div>
      ) : null}

      {/* Token text */}
      {token && (
        <div style={{ background: "#1e293b", borderRadius: "8px", padding: "0.75rem 1rem", maxWidth: "360px", width: "100%", wordBreak: "break-all" }}>
          <div style={{ fontSize: "0.65rem", color: "#64748b", marginBottom: "0.25rem" }}>QR Token (untuk test via curl):</div>
          <div style={{ fontSize: "0.75rem", color: "#a5f3fc", letterSpacing: "0.05em" }}>{token}</div>
        </div>
      )}

      {/* Petunjuk */}
      <div style={{ background: "#1e293b", borderRadius: "8px", padding: "1rem", maxWidth: "360px", width: "100%", fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.7 }}>
        <div style={{ color: "#e2e8f0", fontWeight: 700, marginBottom: "0.5rem" }}>Cara pakai (dev mode):</div>
        <ol style={{ paddingLeft: "1.2rem", margin: 0 }}>
          <li>Login di app mobile sebagai pegawai mock</li>
          <li>Scan QR ini dari fitur absensi app</li>
          <li>Kirim dengan <code style={{ color: "#a5f3fc" }}>{'"beacon":{"detected":false}'}</code> — beacon dilewati otomatis</li>
          <li>QR auto-refresh setiap {interval}s</li>
        </ol>
        <div style={{ marginTop: "0.75rem", color: "#475569", fontSize: "0.65rem" }}>
          Halaman ini hanya muncul saat LEGACY_SSO_MOCK=true
        </div>
      </div>
    </div>
  )
}
