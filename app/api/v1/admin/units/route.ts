import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const createSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional().nullable(),
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

  const units = await prisma.workUnit.findMany({
    include: { parent: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(units)
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

  if (parsed.data.parentId) {
    const parent = await prisma.workUnit.findUnique({ where: { id: parsed.data.parentId } })
    if (!parent) return Errors.notFound("Unit kerja induk")
  }

  const unit = await prisma.workUnit.create({ data: parsed.data })
  return NextResponse.json(unit, { status: 201 })
}
