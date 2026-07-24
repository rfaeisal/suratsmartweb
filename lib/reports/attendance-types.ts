export interface AttendanceRow {
  nip: string
  nama: string
  unit: string
  tanggalKerja: string   // YYYY-MM-DD
  shift: string | null
  eventType: string | null
  recordedAt: string | null  // ISO string
  status: "hadir" | "alpha"
  telat: boolean
  flags: string[]
  beaconDetected: boolean | null
}
