export interface MonthlyRecapRow {
  nip: string
  nama: string
  unit: string
  hariKerja: number     // total roster pegawai di bulan itu
  hadir: number         // hari dengan minimal 1 tap MASUK/PULANG dari roster
  telat: number         // hari dengan tap MASUK yang telat
  persentase: number    // 0..100, rounded 1 desimal
}

export interface MonthlyRecapSummary {
  totalPegawai: number
  totalHariKerja: number
  totalHadir: number
  totalTelat: number
  rataPersentase: number   // rata-rata persentase kehadiran seluruh pegawai
}

// Threshold highlight — dipakai bareng oleh client, Excel, dan PDF supaya konsisten.
// Baris pegawai dianggap "warning" kalau melewati threshold ini.
export const HIGHLIGHT_TELAT_THRESHOLD = 5      // telat ≥ 5 hari
export const HIGHLIGHT_PERSENTASE_MIN = 80      // % kehadiran < 80%

export type HighlightLevel = "danger" | "warning" | "normal"

/**
 * Prioritas: danger > warning > normal.
 * - danger: persentase kehadiran < HIGHLIGHT_PERSENTASE_MIN
 * - warning: telat ≥ HIGHLIGHT_TELAT_THRESHOLD
 * - normal: sisanya
 */
export function highlightLevel(row: MonthlyRecapRow): HighlightLevel {
  if (row.hariKerja > 0 && row.persentase < HIGHLIGHT_PERSENTASE_MIN) return "danger"
  if (row.telat >= HIGHLIGHT_TELAT_THRESHOLD) return "warning"
  return "normal"
}
