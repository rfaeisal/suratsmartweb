import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
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
  const unit = await prisma.workUnit.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
    },
  })
  if (!unit) return Errors.notFound("Unit kerja")
  return NextResponse.json(unit)
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

  const existing = await prisma.workUnit.findUnique({ where: { id } })
  if (!existing) return Errors.notFound("Unit kerja")

  if (parsed.data.parentId === id) {
    return Errors.validation("Unit kerja tidak bisa menjadi parent dari dirinya sendiri")
  }

  const updated = await prisma.workUnit.update({ where: { id }, data: parsed.data })
  return NextResponse.json(updated)
}
