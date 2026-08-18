import { shiftStartUtc, shiftEndUtc } from "./tanggal-kerja"

const MS_PER_MINUTE = 60_000

export interface ShiftForWindow {
  startTime: string
  endTime: string
  crossesMidnight: boolean
  checkInWindowStart: string | null
  checkInWindowEnd: string | null
  checkOutWindowStart: string | null
  checkOutWindowEnd: string | null
}

export interface WindowSettings {
  toleransiTelatMenit: number
  checkInBeforeStartMinutes: number
  checkOutBeforeEndMinutes: number
  checkOutAfterEndMinutes: number
}

export interface ResolvedWindow {
  checkIn: { startUtc: Date; endUtc: Date; source: "shift" | "default" }
  checkOut: { startUtc: Date; endUtc: Date; source: "shift" | "default" }
}

/**
 * Menghitung window absen (masuk & pulang) untuk sebuah shift pada tanggalKerja.
 *
 * - Kalau field window di shift terisi ("HH:MM") → dipakai apa adanya.
 *   `checkInWindowStart` selalu relatif terhadap `tanggalKerja`.
 *   `checkOutWindowStart`/`End` mengikuti aturan `crossesMidnight`
 *   (jika shift lintas tengah malam, jam akhir jatuh di hari berikutnya).
 * - Kalau field window kosong → derive dari `startTime`/`endTime` +
 *   settings global. Fallback default:
 *     - checkIn.start  = shiftStart - checkInBeforeStartMinutes
 *     - checkIn.end    = shiftStart + toleransiTelatMenit
 *     - checkOut.start = shiftEnd   - checkOutBeforeEndMinutes
 *     - checkOut.end   = shiftEnd   + checkOutAfterEndMinutes
 */
export function resolveWindow(
  shift: ShiftForWindow,
  tanggalKerja: Date,
  settings: WindowSettings,
): ResolvedWindow {
  const shiftStart = shiftStartUtc(tanggalKerja, shift.startTime)
  const shiftEnd = shiftEndUtc(tanggalKerja, shift.endTime, shift.crossesMidnight)

  const checkInStart = shift.checkInWindowStart
    ? shiftStartUtc(tanggalKerja, shift.checkInWindowStart)
    : new Date(shiftStart.getTime() - settings.checkInBeforeStartMinutes * MS_PER_MINUTE)
  const checkInEnd = shift.checkInWindowEnd
    ? shiftStartUtc(tanggalKerja, shift.checkInWindowEnd)
    : new Date(shiftStart.getTime() + settings.toleransiTelatMenit * MS_PER_MINUTE)

  // Untuk window pulang, kalau shift crossesMidnight, jam HH:MM window pulang
  // otomatis dianggap di hari berikutnya (sama dengan endTime shift).
  const checkOutStart = shift.checkOutWindowStart
    ? shiftEndUtc(tanggalKerja, shift.checkOutWindowStart, shift.crossesMidnight)
    : new Date(shiftEnd.getTime() - settings.checkOutBeforeEndMinutes * MS_PER_MINUTE)
  const checkOutEnd = shift.checkOutWindowEnd
    ? shiftEndUtc(tanggalKerja, shift.checkOutWindowEnd, shift.crossesMidnight)
    : new Date(shiftEnd.getTime() + settings.checkOutAfterEndMinutes * MS_PER_MINUTE)

  return {
    checkIn: {
      startUtc: checkInStart,
      endUtc: checkInEnd,
      source: shift.checkInWindowStart || shift.checkInWindowEnd ? "shift" : "default",
    },
    checkOut: {
      startUtc: checkOutStart,
      endUtc: checkOutEnd,
      source: shift.checkOutWindowStart || shift.checkOutWindowEnd ? "shift" : "default",
    },
  }
}
