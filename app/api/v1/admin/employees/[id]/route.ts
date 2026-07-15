import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

const updateSchema = z.object({
  positionTitle: z.string().min(1).optional(),
  room: z.string().optional(),
  directSupervisorLegacyId: z.string().nullable().optional(),
})

type Props = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Props) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    return Errors.forbidden()
  }

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Format data tidak valid")

  const employee = await prisma.employee.findUnique({ where: { id } })
  if (!employee) return Errors.notFound("Pegawai")

  // Validasi atasan jika diisi
  if (parsed.data.directSupervisorLegacyId) {
    const supervisor = await prisma.employee.findUnique({
      where: { legacyId: parsed.data.directSupervisorLegacyId },
    })
    if (!supervisor) return Errors.validation("Pegawai atasan tidak ditemukan")
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      ...(parsed.data.positionTitle !== undefined ? { positionTitle: parsed.data.positionTitle } : {}),
      ...(parsed.data.room !== undefined ? { room: parsed.data.room } : {}),
      ...(parsed.data.directSupervisorLegacyId !== undefined
        ? { directSupervisorId: parsed.data.directSupervisorLegacyId }
        : {}),
    },
    include: { unit: { select: { name: true } } },
  })

  await writeAuditLog({
    actorId: session.user.id,
    action: "UPDATE_EMPLOYEE",
    entityType: "Employee",
    entityId: id,
    metadata: { changes: parsed.data } as unknown as import("@prisma/client").Prisma.InputJsonValue,
  })

  return NextResponse.json(updated)
}
