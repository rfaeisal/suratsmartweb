/**
 * Seed data untuk development/testing.
 * Akun mock SSO tersedia di lib/legacy/client.ts.
 *
 * Hierarki approval:
 *   pegawai1 / pppk1 → atasan1 (Kasubag) → kabag1 (Kabag TU) → wadir1 (Wadir) → direktur1
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

  // ─── Master jabatan ──────────────────────────────────────────────────────────
  // level: angka lebih besar = jabatan lebih tinggi dalam hierarki
  const positionDefs = [
    { name: "Staf",                            level: 1 },
    { name: "Staf Sekretariat Direktur",       level: 1 },
    { name: "Kepala Sub-Bagian Umum",          level: 2 },
    { name: "Admin Kepegawaian",               level: 2 },
    { name: "Kepala Bagian Tata Usaha",        level: 3 },
    { name: "Wakil Direktur Umum dan Keuangan", level: 4 },
    { name: "Direktur",                        level: 5 },
  ]

  const positionMap: Record<string, string> = {}
  for (const def of positionDefs) {
    const pos = await prisma.position.upsert({
      where: { name: def.name },
      create: { name: def.name, level: def.level },
      update: { level: def.level },
    })
    positionMap[def.name] = pos.id
    console.log(`✓ Jabatan: ${def.name} (level ${def.level})`)
  }

  // ─── Pegawai mock ────────────────────────────────────────────────────────────
  type MockEmployee = {
    legacyId: string
    nip: string
    fullName: string
    employeeType: "PNS" | "PPPK" | "BLUD"
    unitId: string
    positionTitle: string
    directSupervisorId?: string
    username?: string
    roles: Array<"PEGAWAI" | "APPROVER" | "ADMIN_KEPEGAWAIAN" | "SUPERADMIN">
  }

  const mockEmployees: MockEmployee[] = [
    {
      legacyId: "9998",
      nip: "000000000000000001",
      fullName: "Super Administrator",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Admin Kepegawaian",
      username: "superadmin",
      roles: ["PEGAWAI", "SUPERADMIN", "ADMIN_KEPEGAWAIAN"],
    },
    {
      legacyId: "9999",
      nip: "000000000000000000",
      fullName: "Administrator",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Admin Kepegawaian",
      username: "admin",
      roles: ["PEGAWAI", "ADMIN_KEPEGAWAIAN"],
    },
    {
      legacyId: "5001",
      nip: "196001012000011001",
      fullName: "Dr. Bambang Wijaya, M.Kes",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Direktur",
      username: "direktur1",
      roles: ["PEGAWAI", "APPROVER"],
    },
    {
      legacyId: "5002",
      nip: "199201012020011001",
      fullName: "Rina Marlina",
      employeeType: "PNS",
      unitId: "U00",
      positionTitle: "Staf Sekretariat Direktur",
      directSupervisorId: "5001",
      username: "staf_dir1",
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
      username: "wadir1",
      roles: ["PEGAWAI", "APPROVER"],
    },
    {
      legacyId: "3001",
      nip: "197001012000011001",
      fullName: "Ahmad Fauzi",
      employeeType: "PNS",
      unitId: "U01",
      positionTitle: "Kepala Bagian Tata Usaha",
      directSupervisorId: "4001",
      username: "kabag1",
      roles: ["PEGAWAI", "APPROVER"],
    },
    {
      legacyId: "2001",
      nip: "197501012000011001",
      fullName: "Siti Rahayu",
      employeeType: "PNS",
      unitId: "U01",
      positionTitle: "Kepala Sub-Bagian Umum",
      directSupervisorId: "3001",
      username: "atasan1",
      roles: ["PEGAWAI", "APPROVER"],
    },
    {
      legacyId: "1001",
      nip: "198501012010011001",
      fullName: "Budi Santoso",
      employeeType: "PNS",
      unitId: "U01",
      positionTitle: "Staf",
      directSupervisorId: "2001",
      username: "pegawai1",
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
      username: "pppk1",
      roles: ["PEGAWAI"],
    },
    {
      legacyId: "6001",
      nip: "200001012025011001",
      fullName: "Fajar Nugroho",
      employeeType: "PPPK",
      unitId: "U01",
      positionTitle: "Analis Kepegawaian",
      directSupervisorId: "1001",
      username: "pegawai.baru",
      roles: ["PEGAWAI"],
    },
    {
      legacyId: "6002",
      nip: "199805152024012001",
      fullName: "Wulandari Putri",
      employeeType: "BLUD",
      unitId: "U01",
      positionTitle: "Pengelola Administrasi",
      directSupervisorId: "2001",
      username: "pegawai.baru2",
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
        positionId: positionMap[emp.positionTitle] ?? null,
        directSupervisorId: emp.directSupervisorId ?? null,
        isActive: true,
      },
      update: {
        fullName: emp.fullName,
        positionTitle: emp.positionTitle,
        positionId: positionMap[emp.positionTitle] ?? null,
        directSupervisorId: emp.directSupervisorId ?? null,
        unitId: emp.unitId,
      },
    })

    const user = await prisma.appUser.upsert({
      where: { employeeId: employee.id },
      create: { employeeId: employee.id, roles: emp.roles, username: emp.username ?? null },
      update: { roles: emp.roles, ...(emp.username ? { username: emp.username } : {}) },
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
  console.log("\n📋 Akun testing (username / password → role):")
  console.log("  ┌─────────────────┬──────────────┬─────────────────────────────────────────┐")
  console.log("  │ Username        │ Password     │ Role & Jabatan                          │")
  console.log("  ├─────────────────┼──────────────┼─────────────────────────────────────────┤")
  console.log("  │ superadmin      │ superadmin123│ SUPERADMIN + ADMIN_KEPEGAWAIAN          │")
  console.log("  │ admin           │ admin123     │ ADMIN_KEPEGAWAIAN                       │")
  console.log("  │ direktur1       │ direktur123  │ APPROVER — Direktur                     │")
  console.log("  │ wadir1          │ wadir123     │ APPROVER — Wakil Direktur               │")
  console.log("  │ kabag1          │ kabag123     │ APPROVER — Kepala Bagian TU             │")
  console.log("  │ atasan1         │ atasan123    │ APPROVER — Kepala Sub-Bagian Umum       │")
  console.log("  │ pegawai1        │ pegawai123   │ PEGAWAI  — Staf (PNS)                   │")
  console.log("  │ pppk1           │ pppk123      │ PEGAWAI  — Staf (PPPK)                  │")
  console.log("  │ pegawai.baru    │ baru123      │ PEGAWAI  — Analis Kepegawaian (PPPK)    │")
  console.log("  │ pegawai.baru2   │ baru123      │ PEGAWAI  — Pengelola Administrasi (BLUD)│")
  console.log("  │ staf_dir1       │ stafdir123   │ PEGAWAI  — Staf Sekretariat Direktur    │")
  console.log("  └─────────────────┴──────────────┴─────────────────────────────────────────┘")
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
