import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const createSchema = z.object({
  code: z.string().min(1).max(50).toUpperCase(),
  name: z.string().min(1),
  applicableTo: z.array(z.enum(["PNS", "PPPK", "BLUD"])).min(1),
  requiresAttachment: z.boolean().default(false),
  defaultQuotaDays: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
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
  const isActiveParam = searchParams.get("isActive")
  const isActive = isActiveParam === null ? undefined : isActiveParam === "true"

  const leaveTypes = await prisma.leaveType.findMany({
    where: { ...(isActive !== undefined && { isActive }) },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(leaveTypes)
}

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
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

  const existing = await prisma.leaveType.findUnique({ where: { code: parsed.data.code } })
  if (existing) {
    return Errors.conflict(`Kode jenis cuti '${parsed.data.code}' sudah digunakan`)
  }

  const leaveType = await prisma.leaveType.create({ data: parsed.data })

  return NextResponse.json(leaveType, { status: 201 })
}
