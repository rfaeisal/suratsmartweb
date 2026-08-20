import type { OvertimeStatus } from "@prisma/client"

// ============================================================
// TYPES
// ============================================================

export interface OvertimeDetailRow {
  id: string
  nip: string
  nama: string
  unit: string
  tanggalKerja: string  // YYYY-MM-DD
  status: OvertimeStatus
  note: string | null
  masukAt: string | null    // ISO8601 UTC
  pulangAt: string | null   // ISO8601 UTC
  durasiMenit: number | null  // null kalau tap tidak lengkap
  approvedUnitAt: string | null
  approvedHrAt: string | null
  rejectedAt: string | null
}

export interface OvertimeSummaryRow {
  nip: string
  nama: string
  unit: string
  jumlahPengajuan: number
  jumlahSah: number
  jumlahDitolak: number
  jumlahMenunggu: number     // DIAJUKAN + DISETUJUI_UNIT
  totalDurasiMenit: number   // total durasi dari tap absen lembur (yg lengkap)
}

export interface OvertimeReportSummary {
  totalPengajuan: number
  totalSah: number
  totalDitolak: number
  totalMenunggu: number
  totalDurasiMenit: number
}

export const STATUS_LABEL: Record<OvertimeStatus, string> = {
  DIAJUKAN: "Diajukan",
  DISETUJUI_UNIT: "Disetujui Unit",
  SAH: "Sah",
  DITOLAK: "Ditolak",
}

// ============================================================
// HELPERS
// ============================================================

/** Format durasi menit → "2j 30m", atau "—" kalau null/0. */
export function formatDurasi(menit: number | null): string {
  if (menit === null || menit === 0) return "—"
  const jam = Math.floor(menit / 60)
  const sisa = menit % 60
  if (jam === 0) return `${sisa}m`
  if (sisa === 0) return `${jam}j`
  return `${jam}j ${sisa}m`
}

/** Format ISO8601 UTC → HH:mm WITA (UTC+8). */
export function formatJam(iso: string | null): string {
  if (!iso) return "—"
  const WITA_OFFSET_MS = 8 * 60 * 60 * 1000
  const d = new Date(new Date(iso).getTime() + WITA_OFFSET_MS)
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

/** Format tanggal YYYY-MM-DD → "20 Agu 2026". */
export function formatTanggal(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
  return `${d} ${bulan[m - 1]} ${y}`
}

/** Hitung menit antara 2 timestamp ISO (masuk s.d. pulang). Return null kalau salah satu missing. */
export function hitungDurasiMenit(masukIso: string | null, pulangIso: string | null): number | null {
  if (!masukIso || !pulangIso) return null
  const masuk = new Date(masukIso).getTime()
  const pulang = new Date(pulangIso).getTime()
  if (pulang <= masuk) return null
  return Math.round((pulang - masuk) / 60_000)
}
