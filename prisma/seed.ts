/**
 * Seed data untuk development/testing.
 * Akun mock SSO tersedia di lib/legacy/client.ts.
 *
 * Hierarki approval:
 *   pegawai1 / pppk1 → atasan1 (Kasubag) → kabag1 (Kabag TU) → wadir1 (Wadir)
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  // ─── Unit kerja ─────────────────────────────────────────────────────────────
  await prisma.workUnit.upsert({
    where: { id: "U00" },
    create: { id: "U00", name: "Bagian Kepegawaian" },
    update: { name: "Bagian Kepegawaian" },
  })
  await prisma.workUnit.upsert({
    where: { id: "U01" },
    create: { id: "U01", name: "Bagian Umum" },
    update: { name: "Bagian Umum" },
  })
  console.log("✓ Unit kerja: Bagian Kepegawaian, Bagian Umum")

  // ─── Pegawai mock ────────────────────────────────────────────────────────────
  type MockEmployee = {
    legacyId: string
    nip: string
    fullName: string
    employeeType: "PNS" | "PPPK" | "BLUD"
    unitId: string
    positionTitle: string
    directSupervisorId?: string
    roles: Array<"PEGAWAI" | "APPROVER" | "ADMIN_KEPEGAWAIAN" | "SUPERADMIN">
  }

  const mockEmployees: MockEmployee[] = [
    {
      legacyId: "9999",
      nip: "000000000000000000",
      fullName: "Administrator",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Admin Kepegawaian",
      roles: ["ADMIN_KEPEGAWAIAN"],
    },
    {
      legacyId: "5001",
      nip: "196001012000011001",
      fullName: "Dr. Bambang Wijaya, M.Kes",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Direktur",
      roles: ["APPROVER"],
    },
    {
      legacyId: "5002",
      nip: "199201012020011001",
      fullName: "Rina Marlina",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Staf Sekretariat Direktur",
      directSupervisorId: "5001",
      roles: ["PEGAWAI"],
    },
    {
      legacyId: "4001",
      nip: "196501012000011001",
      fullName: "Hendra Kusuma",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Wakil Direktur Umum dan Keuangan",
      directSupervisorId: "5001",
      roles: ["APPROVER"],
    },
    {
      legacyId: "3001",
      nip: "197001012000011001",
      fullName: "Ahmad Fauzi",
      employeeType: "PNS",
      unitId: "U01",
      positionTitle: "Kepala Bagian Tata Usaha",
      directSupervisorId: "4001",
      roles: ["APPROVER"],
    },
    {
      legacyId: "2001",
      nip: "197501012000011001",
      fullName: "Siti Rahayu",
      employeeType: "PNS",
      unitId: "U01",
      positionTitle: "Kepala Sub-Bagian Umum",
      directSupervisorId: "3001",
      roles: ["APPROVER"],
    },
    {
      legacyId: "1001",
      nip: "198501012010011001",
      fullName: "Budi Santoso",
      employeeType: "PNS",
      unitId: "U01",
      positionTitle: "Staf",
      directSupervisorId: "2001",
      roles: ["PEGAWAI"],
    },
    {
      legacyId: "1002",
      nip: "199001022021211001",
      fullName: "Dian Pratiwi",
      employeeType: "PPPK",
      unitId: "U01",
      positionTitle: "Staf",
      directSupervisorId: "2001",
      roles: ["PEGAWAI"],
    },
  ]

  for (const emp of mockEmployees) {
    const employee = await prisma.employee.upsert({
      where: { legacyId: emp.legacyId },
      create: {
        legacyId: emp.legacyId,
        nip: emp.nip,
        fullName: emp.fullName,
        employeeType: emp.employeeType,
        unitId: emp.unitId,
        positionTitle: emp.positionTitle,
        directSupervisorId: emp.directSupervisorId ?? null,
        isActive: true,
      },
      update: {
        fullName: emp.fullName,
        positionTitle: emp.positionTitle,
        directSupervisorId: emp.directSupervisorId ?? null,
        unitId: emp.unitId,
      },
    })

    const user = await prisma.appUser.upsert({
      where: { employeeId: employee.id },
      create: { employeeId: employee.id, roles: emp.roles },
      update: { roles: emp.roles },
    })

    console.log(`✓ ${emp.fullName} (${emp.legacyId}) → ${user.roles.join(", ")}`)
  }

  // ─── Jenis cuti default ───────────────────────────────────────────────────────
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
  console.log("\nAkun mock SSO (gunakan di /login):")
  console.log("  admin      / admin123     → ADMIN_KEPEGAWAIAN")
  console.log("  direktur1  / direktur123  → APPROVER  (Direktur)")
  console.log("  wadir1     / wadir123     → APPROVER  (Wakil Direktur)")
  console.log("  kabag1     / kabag123     → APPROVER  (Kepala Bagian TU)")
  console.log("  atasan1    / atasan123    → APPROVER  (Kepala Sub-Bagian)")
  console.log("  pegawai1   / pegawai123   → PEGAWAI")
  console.log("  pppk1      / pppk123      → PEGAWAI")
  console.log("  staf_dir1  / stafdir123   → PEGAWAI   (Staf Sekretariat Direktur)")
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
