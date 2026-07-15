import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  level: z.number().int().min(1).max(99).optional(),
  isActive: z.boolean().optional(),
})

type Props = { params: Promise<{ id: string }> }

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) return null
  return session
}

export async function PUT(req: NextRequest, { params }: Props) {
  const session = await requireAdmin()
  if (!session) return Errors.unauthorized()

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return Errors.validation("Body tidak valid") }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Data tidak valid", parsed.error.flatten().fieldErrors)

  const position = await prisma.position.findUnique({ where: { id } })
  if (!position) return Errors.notFound("Jabatan")

  if (parsed.data.name && parsed.data.name !== position.name) {
    const existing = await prisma.position.findUnique({ where: { name: parsed.data.name } })
    if (existing) return Errors.validation("Nama jabatan sudah ada")
  }

  const updated = await prisma.position.update({ where: { id }, data: parsed.data })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const session = await requireAdmin()
  if (!session) return Errors.unauthorized()

  const { id } = await params
  const position = await prisma.position.findUnique({ where: { id } })
  if (!position) return Errors.notFound("Jabatan")

  await prisma.position.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
