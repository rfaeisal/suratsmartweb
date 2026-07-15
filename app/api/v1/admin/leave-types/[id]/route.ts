import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const updateSchema = z.object({
  code: z.string().min(1).max(50).toUpperCase().optional(),
  name: z.string().min(1).optional(),
  applicableTo: z.array(z.enum(["PNS", "PPPK", "BLUD"])).min(1).optional(),
  requiresAttachment: z.boolean().optional(),
  defaultQuotaDays: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
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
  const leaveType = await prisma.leaveType.findUnique({ where: { id } })
  if (!leaveType) return Errors.notFound("Jenis cuti")

  return NextResponse.json(leaveType)
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

  const existing = await prisma.leaveType.findUnique({ where: { id } })
  if (!existing) return Errors.notFound("Jenis cuti")

  if (parsed.data.code && parsed.data.code !== existing.code) {
    const codeConflict = await prisma.leaveType.findUnique({ where: { code: parsed.data.code } })
    if (codeConflict) {
      return Errors.conflict(`Kode jenis cuti '${parsed.data.code}' sudah digunakan`)
    }
  }

  const updated = await prisma.leaveType.update({ where: { id }, data: parsed.data })
  return NextResponse.json(updated)
}
