import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

const updateSchema = z.object({
  positionId: z.string().nullable().optional(),
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

  // Validasi positionId dan ambil nama jabatan untuk sinkron positionTitle
  let positionName: string | undefined
  if (parsed.data.positionId !== undefined) {
    if (parsed.data.positionId) {
      const pos = await prisma.position.findUnique({ where: { id: parsed.data.positionId } })
      if (!pos) return Errors.validation("Jabatan tidak ditemukan")
      positionName = pos.name
    } else {
      positionName = undefined
    }
  }

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
      ...(parsed.data.positionId !== undefined
        ? { positionId: parsed.data.positionId, positionTitle: positionName ?? null }
        : {}),
      ...(parsed.data.room !== undefined ? { room: parsed.data.room } : {}),
      ...(parsed.data.directSupervisorLegacyId !== undefined
        ? { directSupervisorId: parsed.data.directSupervisorLegacyId }
        : {}),
    },
    include: {
      unit: { select: { name: true } },
      position: { select: { id: true, name: true, level: true } },
    },
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
