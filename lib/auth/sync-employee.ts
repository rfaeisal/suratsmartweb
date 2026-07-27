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
      isActive: data.isActive,
    },
  })

  return employee
}
