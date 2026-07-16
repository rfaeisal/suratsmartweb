import { prisma } from "@/lib/prisma"

// TODO: konfirmasi ke bagian kepegawaian apakah hitungan hari kalender atau hari kerja
export function calculateTotalDays(startDate: Date, endDate: Date): number {
  if (endDate < startDate) throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai")
  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
}

export async function generateRequestNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `CS-${year}-`
  const count = await prisma.leaveRequest.count({
    where: { requestNumber: { startsWith: prefix } },
  })
  return `${prefix}${(count + 1).toString().padStart(6, "0")}`
}

export interface QuotaCheckResult {
  hasQuota: boolean      // apakah jenis cuti ini berbasis kuota
  remaining: number | null  // sisa kuota (null = tidak berbasis kuota)
  sufficient: boolean    // apakah kuota cukup untuk totalDays yang diminta
}

export async function checkQuota(
  employeeId: string,
  leaveTypeId: string,
  totalDays: number,
  year: number = new Date().getFullYear(),
): Promise<QuotaCheckResult> {
  const leaveType = await prisma.leaveType.findUnique({
    where: { id: leaveTypeId },
    select: { defaultQuotaDays: true },
  })

  // Jenis cuti tidak berbasis kuota (misal cuti sakit, cuti melahirkan)
  if (!leaveType?.defaultQuotaDays) {
    return { hasQuota: false, remaining: null, sufficient: true }
  }

  const quota = await prisma.leaveQuota.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  })

  if (!quota) {
    // Kuota belum dibuat admin untuk tahun ini — izinkan tapi beri tahu
    // TODO: konfirmasi ke bagian kepegawaian: blokir atau izinkan?
    return { hasQuota: true, remaining: null, sufficient: true }
  }

  const remaining = quota.totalDays - quota.usedDays
  return { hasQuota: true, remaining, sufficient: remaining >= totalDays }
}

export function formatStatus(status: string): string {
  const map: Record<string, string> = {
    SUBMITTED: "Menunggu Konfirmasi Pengganti",
    DELEGATE_DECLINED: "Pengganti Menolak",
    PENDING_KEPALA_RUANGAN: "Menunggu Persetujuan Kepala Ruangan",
    PENDING_ADMIN_REVIEW: "Menunggu Admin",
    IN_APPROVAL: "Dalam Proses Persetujuan",
    RETURNED: "Dikembalikan untuk Revisi",
    REJECTED: "Ditolak",
    APPROVED: "Disetujui",
    SENT_TO_LEGACY: "Selesai",
    SEND_FAILED: "Gagal Kirim ke Sistem Lama",
  }
  return map[status] ?? status
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    SUBMITTED: "bg-yellow-50 text-yellow-700",
    DELEGATE_DECLINED: "bg-red-50 text-red-700",
    PENDING_KEPALA_RUANGAN: "bg-purple-50 text-purple-700",
    PENDING_ADMIN_REVIEW: "bg-blue-50 text-blue-700",
    IN_APPROVAL: "bg-blue-50 text-blue-700",
    RETURNED: "bg-orange-50 text-orange-700",
    REJECTED: "bg-red-50 text-red-700",
    APPROVED: "bg-green-50 text-green-700",
    SENT_TO_LEGACY: "bg-green-50 text-green-700",
    SEND_FAILED: "bg-red-50 text-red-700",
  }
  return map[status] ?? "bg-gray-100 text-gray-600"
}
