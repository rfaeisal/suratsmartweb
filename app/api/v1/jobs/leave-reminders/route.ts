import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { sendLeaveReminders } from "@/lib/jobs/leave-reminders"
import { Errors } from "@/lib/errors"

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

  try {
    const result = await sendLeaveReminders()
    return NextResponse.json(result)
  } catch (err) {
    console.error("[leave-reminders]", err)
    return Errors.internal()
  }
}
