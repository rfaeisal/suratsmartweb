import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { markAlphaBackfill } from "@/lib/jobs/mark-alpha"
import { Errors } from "@/lib/errors"

const bodySchema = z.object({
  days_back: z.number().int().min(1).max(90).default(1),
})

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ["SUPERADMIN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  const daysBack = parsed.success ? parsed.data.days_back : 1

  try {
    const result = await markAlphaBackfill(daysBack)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[mark-alpha]", err)
    return Errors.internal()
  }
}
