/**
 * Seed data untuk development/testing.
 * Akun mock SSO tersedia di lib/legacy/client.ts:
 *   admin / admin123       → ADMIN_KEPEGAWAIAN
 *   pegawai1 / pegawai123  → PEGAWAI
 *   atasan1 / atasan123    → APPROVER
 *   pppk1 / pppk123        → PEGAWAI
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  // Unit kerja
  const unitKepegawaian = await prisma.workUnit.upsert({
    where: { id: "U00" },
    create: { id: "U00", name: "Bagian Kepegawaian" },
    update: { name: "Bagian Kepegawaian" },
  })

  const unitUmum = await prisma.workUnit.upsert({
    where: { id: "U01" },
    create: { id: "U01", name: "Bagian Umum" },
    update: { name: "Bagian Umum" },
  })

  console.log("✓ Unit kerja:", unitKepegawaian.name, unitUmum.name)

  // Pegawai mock (sinkron dari MOCK_ACCOUNTS di legacy/client.ts)
  const adminEmployee = await prisma.employee.upsert({
    where: { legacyId: "9999" },
    create: {
      legacyId: "9999",
      nip: "000000000000000000",
      fullName: "Administrator",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Admin Kepegawaian",
      isActive: true,
    },
    update: { fullName: "Administrator" },
  })

  const adminUser = await prisma.appUser.upsert({
    where: { employeeId: adminEmployee.id },
    create: { employeeId: adminEmployee.id, roles: ["ADMIN_KEPEGAWAIAN"] },
    update: { roles: ["ADMIN_KEPEGAWAIAN"] },
  })

  console.log("✓ Admin user:", adminEmployee.fullName, "→", adminUser.roles.join(", "))

  // Jenis cuti default (perlu dikonfirmasi ke kepegawaian sebelum go-live)
  const leaveTypes: Array<{
    code: string
    name: string
    applicableTo: Array<"PNS" | "PPPK" | "BLUD">
    defaultQuotaDays: number | null
  }> = [
    { code: "CUTI_TAHUNAN", name: "Cuti Tahunan", applicableTo: ["PNS", "PPPK", "BLUD"], defaultQuotaDays: 12 },
    { code: "CUTI_SAKIT", name: "Cuti Sakit", applicableTo: ["PNS", "PPPK", "BLUD"], defaultQuotaDays: null },
    { code: "CUTI_MELAHIRKAN", name: "Cuti Melahirkan", applicableTo: ["PNS", "PPPK", "BLUD"], defaultQuotaDays: null },
    // TODO: konfirmasi ke bagian kepegawaian untuk PPPK dan BLUD
    { code: "CUTI_BESAR", name: "Cuti Besar", applicableTo: ["PNS"], defaultQuotaDays: null },
    // TODO: konfirmasi untuk BLUD
    { code: "CUTI_ALASAN_PENTING", name: "Cuti Alasan Penting", applicableTo: ["PNS", "PPPK"], defaultQuotaDays: null },
    // TODO: konfirmasi ke bagian kepegawaian
    { code: "CLTN", name: "Cuti di Luar Tanggungan Negara", applicableTo: ["PNS"], defaultQuotaDays: null },
  ]

  for (const lt of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { code: lt.code },
      create: { ...lt, isActive: true },
      update: { name: lt.name },
    })
    console.log("✓ Jenis cuti:", lt.code)
  }

  console.log("\n✅ Seed selesai!")
  console.log("\nAkun tersedia (mode mock SSO):")
  console.log("  admin / admin123       → ADMIN_KEPEGAWAIAN")
  console.log("  pegawai1 / pegawai123  → PEGAWAI")
  console.log("  atasan1 / atasan123    → APPROVER")
  console.log("  pppk1 / pppk123        → PEGAWAI")
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
