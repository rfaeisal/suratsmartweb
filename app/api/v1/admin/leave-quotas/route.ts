import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const createSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  totalDays: z.number().int().positive(),
})

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "FORBIDDEN") return Errors.forbidden()
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { searchParams } = new URL(req.url)
  const employeeId = searchParams.get("employeeId")
  const leaveTypeId = searchParams.get("leaveTypeId")
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined

  const quotas = await prisma.leaveQuota.findMany({
    where: {
      ...(employeeId && { employeeId }),
      ...(leaveTypeId && { leaveTypeId }),
      ...(year !== undefined && { year }),
    },
    include: {
      employee: { select: { nip: true, fullName: true, employeeType: true } },
      leaveType: { select: { code: true, name: true } },
    },
    orderBy: [{ year: "desc" }, { employee: { fullName: "asc" } }],
  })

  return NextResponse.json(quotas)
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "FORBIDDEN") return Errors.forbidden()
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Data tidak valid", parsed.error.flatten().fieldErrors)
  }

  const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } })
  if (!employee) return Errors.notFound("Pegawai")

  const leaveType = await prisma.leaveType.findUnique({ where: { id: parsed.data.leaveTypeId } })
  if (!leaveType) return Errors.notFound("Jenis cuti")

  if (!leaveType.applicableTo.includes(employee.employeeType)) {
    return Errors.validation(
      `Jenis cuti '${leaveType.name}' tidak berlaku untuk pegawai tipe ${employee.employeeType}`,
    )
  }

  const existing = await prisma.leaveQuota.findUnique({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: parsed.data.employeeId,
        leaveTypeId: parsed.data.leaveTypeId,
        year: parsed.data.year,
      },
    },
  })
  if (existing) {
    return Errors.conflict(
      `Kuota untuk pegawai, jenis cuti, dan tahun ini sudah ada. Gunakan PUT untuk mengubah.`,
    )
  }

  const quota = await prisma.leaveQuota.create({ data: parsed.data })
  return NextResponse.json(quota, { status: 201 })
}
