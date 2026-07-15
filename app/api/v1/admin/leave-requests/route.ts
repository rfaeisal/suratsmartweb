import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const unitId = searchParams.get("unitId")
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
    const limit = 20

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (unitId) where.requester = { unitId }

    const [requests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: {
          requester: { select: { fullName: true, nip: true, unit: { select: { name: true } } } },
          leaveType: { select: { name: true } },
          delegate: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leaveRequest.count({ where }),
    ])

    return NextResponse.json({ requests, total, page, limit })
  } catch (err) {
    if (err instanceof AuthError) return Errors[err.code === "FORBIDDEN" ? "forbidden" : err.code === "SESSION_REVOKED" ? "sessionRevoked" : "unauthorized"]()
    return Errors.internal()
  }
}
