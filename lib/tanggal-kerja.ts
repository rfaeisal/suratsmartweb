const WIB_OFFSET_MS = 7 * 60 * 60 * 1000 // UTC+7

/** Mengembalikan UTC midnight dari tanggal WIB untuk timestamp yang diberikan. */
export function getWibDate(now: Date = new Date()): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

/** Mengembalikan UTC datetime dari jam mulai shift pada tanggal_kerja tertentu. */
export function shiftStartUtc(tanggalKerja: Date, startTime: string): Date {
  const [h, m] = startTime.split(":").map(Number)
  return new Date(tanggalKerja.getTime() + h * 3_600_000 + m * 60_000 - WIB_OFFSET_MS)
}

/** Mengembalikan UTC datetime dari jam selesai shift. Shift lintas tengah malam ditambah 24 jam. */
export function shiftEndUtc(tanggalKerja: Date, endTime: string, crossesMidnight: boolean): Date {
  const [h, m] = endTime.split(":").map(Number)
  const base = tanggalKerja.getTime() + h * 3_600_000 + m * 60_000 - WIB_OFFSET_MS
  return new Date(crossesMidnight ? base + 86_400_000 : base)
}

/**
 * Menghitung tanggal_kerja yang benar untuk sebuah event absen, dengan penanganan
 * shift yang melintas tengah malam (mis. 21:00–07:00).
 *
 * Aturan: jika shift.crossesMidnight=true DAN waktu WIB saat ini lebih kecil dari
 * endTime shift → pegawai masih dalam shift hari kemarin → tanggalKerja = kemarin.
 */
export function hitungTanggalKerja(
  recordedAt: Date,
  shift: { crossesMidnight: boolean; endTime: string } | null,
): Date {
  const wib = new Date(recordedAt.getTime() + WIB_OFFSET_MS)
  const todayWib = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))

  if (!shift?.crossesMidnight) return todayWib

  const [endH, endM] = shift.endTime.split(":").map(Number)
  const wibMinuteOfDay = wib.getUTCHours() * 60 + wib.getUTCMinutes()
  const endMinuteOfDay = endH * 60 + endM

  // Masih dalam window shift kemarin (mis. 00:00–06:59 untuk shift 21:00–07:00)
  if (wibMinuteOfDay < endMinuteOfDay) {
    return new Date(todayWib.getTime() - 86_400_000)
  }

  return todayWib
}
