import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import LeaveRequestForm from "./LeaveRequestForm"

export default async function NewLeaveRequestPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const employeeId = session.user.employeeId
  const unitId = session.user.unitId

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { employeeType: true, fullName: true },
  })
  if (!employee) redirect("/login")

  const currentYear = new Date().getFullYear()

  const [leaveTypes, colleagues] = await Promise.all([
    prisma.leaveType.findMany({
      where: { isActive: true, applicableTo: { has: employee.employeeType } },
      include: {
        quotas: {
          where: { employeeId, year: currentYear },
          select: { totalDays: true, usedDays: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { unitId, isActive: true, NOT: { id: employeeId } },
      select: { id: true, fullName: true, positionTitle: true },
      orderBy: { fullName: "asc" },
    }),
  ])

  const leaveTypeOptions = leaveTypes.map((lt) => ({
    id: lt.id,
    code: lt.code,
    name: lt.name,
    requiresAttachment: lt.requiresAttachment,
    remainingDays: lt.quotas[0] ? lt.quotas[0].totalDays - lt.quotas[0].usedDays : null,
    hasQuota: lt.defaultQuotaDays !== null,
  }))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Ajukan Cuti</h2>
        <p className="text-sm text-gray-500 mt-1">{employee.fullName}</p>
      </div>
      <LeaveRequestForm leaveTypes={leaveTypeOptions} colleagues={colleagues} />
    </div>
  )
}
