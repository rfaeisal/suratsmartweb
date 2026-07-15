import { prisma } from "@/lib/prisma"
import type { LegacyEmployee } from "@/lib/legacy/client"

export async function syncEmployeeFromLegacy(data: LegacyEmployee) {
  const unit = await prisma.workUnit.upsert({
    where: { id: data.unit.legacyId },
    create: { id: data.unit.legacyId, name: data.unit.name },
    update: { name: data.unit.name },
  })

  const employee = await prisma.employee.upsert({
    where: { legacyId: data.legacyId },
    create: {
      legacyId: data.legacyId,
      nip: data.nip,
      fullName: data.fullName,
      employeeType: data.employeeType,
      unitId: unit.id,
      positionTitle: data.positionTitle,
      directSupervisorId: data.directSupervisorLegacyId,
      isActive: data.isActive,
    },
    update: {
      nip: data.nip,
      fullName: data.fullName,
      employeeType: data.employeeType,
      unitId: unit.id,
      positionTitle: data.positionTitle,
      directSupervisorId: data.directSupervisorLegacyId,
      isActive: data.isActive,
    },
  })

  return employee
}
