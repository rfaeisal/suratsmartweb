import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const updateSchema = z.object({
  totalDays: z.number().int().positive().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
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

  const { id } = await params
  const quota = await prisma.leaveQuota.findUnique({
    where: { id },
    include: {
      employee: { select: { nip: true, fullName: true, employeeType: true } },
      leaveType: { select: { code: true, name: true } },
    },
  })
  if (!quota) return Errors.notFound("Kuota cuti")
  return NextResponse.json(quota)
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
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

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Data tidak valid", parsed.error.flatten().fieldErrors)
  }

  const existing = await prisma.leaveQuota.findUnique({ where: { id } })
  if (!existing) return Errors.notFound("Kuota cuti")

  if (parsed.data.totalDays !== undefined && parsed.data.totalDays < existing.usedDays) {
    return Errors.validation(
      `Total hari (${parsed.data.totalDays}) tidak boleh lebih kecil dari hari yang sudah digunakan (${existing.usedDays})`,
    )
  }

  const updated = await prisma.leaveQuota.update({ where: { id }, data: parsed.data })
  return NextResponse.json(updated)
}
