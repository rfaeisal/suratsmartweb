import { prisma } from "@/lib/prisma"
import { getWibDate } from "@/lib/tanggal-kerja"

export interface MarkAlphaResult {
  marked: number
  skipped: number
}

/**
 * Tandai pegawai ber-roster tanpa absen apapun sebagai Alpha.
 * Hanya memproses tanggal kerja yang sudah lewat (< hari ini WIB).
 * Idempoten — memanggil dua kali tidak menggandakan catatan.
 */
export async function markAlphaForDate(tanggalKerja: Date): Promise<MarkAlphaResult> {
  const today = getWibDate()
  if (tanggalKerja >= today) return { marked: 0, skipped: 0 }

  const rostersWithoutAlpha = await prisma.roster.findMany({
    where: { tanggalKerja, alphaRecord: { is: null } },
    select: { id: true, employeeId: true },
  })

  if (rostersWithoutAlpha.length === 0) return { marked: 0, skipped: 0 }

  const employeeIds = rostersWithoutAlpha.map((r) => r.employeeId)
  const presentIds = await prisma.attendance
    .findMany({ where: { tanggalKerja, employeeId: { in: employeeIds } }, select: { employeeId: true } })
    .then((rows) => new Set(rows.map((r) => r.employeeId)))

  const rosters = rostersWithoutAlpha.filter((r) => !presentIds.has(r.employeeId))

  if (rosters.length === 0) return { marked: 0, skipped: 0 }

  await prisma.alphaRecord.createMany({
    data: rosters.map((r) => ({
      employeeId: r.employeeId,
      rosterId: r.id,
      tanggalKerja,
    })),
    skipDuplicates: true,
  })

  return { marked: rosters.length, skipped: 0 }
}

/**
 * Jalankan mark-alpha untuk N hari ke belakang (default: 1 = kemarin saja).
 * Berguna untuk backfill jika job gagal beberapa hari.
 */
export async function markAlphaBackfill(daysBack: number = 1): Promise<MarkAlphaResult> {
  const today = getWibDate()
  let marked = 0
  let skipped = 0

  for (let i = 1; i <= daysBack; i++) {
    const target = new Date(today.getTime() - i * 86_400_000)
    const result = await markAlphaForDate(target)
    marked += result.marked
    skipped += result.skipped
  }

  return { marked, skipped }
}
