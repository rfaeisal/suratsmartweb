export interface AttendanceRow {
  nip: string
  nama: string
  unit: string
  tanggalKerja: string   // YYYY-MM-DD
  shift: string | null
  jamMasuk: string | null    // ISO string, dari Attendance eventType=MASUK
  jamPulang: string | null   // ISO string, dari Attendance eventType=PULANG
  status: "hadir" | "alpha" | "belum"
  telat: boolean
  flags: string[]
  beaconDetected: boolean | null
}

/**
 * Format flag internal + beacon jadi keterangan yang bisa dibaca user.
 * - Flag "telat" di-skip karena sudah tampil di kolom Status ("Hadir Telat").
 * - Kalau beacon tidak terdeteksi (false, bukan null), tampilkan warning.
 * - Return string kosong kalau tidak ada keterangan.
 */
const FLAG_LABELS: Record<string, string> = {
  no_roster: "Tanpa jadwal",
  overtime_unapproved: "Lembur belum disetujui",
  overtime_auto_created: "Pengajuan lembur auto-generate",
  overtime_pending: "Lembur menunggu approval",
}

export function formatKeterangan(row: AttendanceRow): string {
  const parts: string[] = []
  for (const f of row.flags) {
    if (f === "telat") continue // redundant dengan badge status
    parts.push(FLAG_LABELS[f] ?? f)
  }
  if (row.beaconDetected === false) parts.push("Beacon tidak terdeteksi")
  return parts.join(", ")
}
