import { prisma } from "@/lib/prisma"
import type { LegacyEmployee } from "@/lib/legacy/client"

export async function syncEmployeeFromLegacy(data: LegacyEmployee) {
  const employee = await prisma.employee.upsert({
    where: { legacyId: data.legacyId },
    create: {
      legacyId: data.legacyId,
      nip: data.nip,
      fullName: data.fullName,
      employeeType: data.employeeType,
      isActive: data.isActive,
      source: "LEGACY",
    },
    update: {
      nip: data.nip,
      fullName: data.fullName,
      employeeType: data.employeeType,
      // NOTE: isActive sengaja TIDAK di-overwrite pada update.
      // Alasan: admin bisa override manual dari admin panel (mis. mengaktifkan
      // pegawai yang di legacy salah ditandai non-aktif), dan override itu
      // tidak boleh ke-reset saat sync ulang. Nilai awal saat create tetap
      // ambil dari legacy.
    },
  })

  return employee
}
