import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const createSchema = z.object({
  name: z.string().min(2).max(100),
  level: z.number().int().min(1).max(99),
})

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) return null
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return Errors.unauthorized()

  const positions = await prisma.position.findMany({
    orderBy: [{ level: "desc" }, { name: "asc" }],
  })
  return NextResponse.json(positions)
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return Errors.unauthorized()

  let body: unknown
  try { body = await req.json() } catch { return Errors.validation("Body tidak valid") }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Data tidak valid", parsed.error.flatten().fieldErrors)

  const existing = await prisma.position.findUnique({ where: { name: parsed.data.name } })
  if (existing) return Errors.validation("Nama jabatan sudah ada")

  const position = await prisma.position.create({ data: parsed.data })
  return NextResponse.json(position, { status: 201 })
}
