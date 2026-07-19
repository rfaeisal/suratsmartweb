import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(req: NextRequest) {
  let user
  try {
    user = await requireAuth(req)
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10)
  const limit = isNaN(rawLimit) ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT)

  if (q.length < 2) {
    return NextResponse.json({ error: "Parameter q minimal 2 karakter" }, { status: 400 })
  }

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      NOT: { id: user.employeeId },
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { nip: { contains: q } },
      ],
    },
    select: {
      id: true,
      nip: true,
      fullName: true,
      positionTitle: true,
      employeeType: true,
      unit: { select: { id: true, name: true } },
    },
    orderBy: { fullName: "asc" },
    take: limit,
  })

  return NextResponse.json(employees)
}
