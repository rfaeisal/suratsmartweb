import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { sendAttendanceReminders } from "@/lib/jobs/attendance-reminders"
import { Errors } from "@/lib/errors"

const bodySchema = z.object({
  grace_minutes: z.number().int().min(0).max(120).default(30),
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
  const graceMins = parsed.success ? parsed.data.grace_minutes : 30

  try {
    const result = await sendAttendanceReminders(graceMins)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[attendance-reminders]", err)
    return Errors.internal()
  }
}
