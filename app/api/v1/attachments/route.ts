import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { saveTempFile } from "@/lib/upload"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"

export async function POST(req: NextRequest) {
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

  if (!rateLimit(`upload:${user.employeeId}`, 20, 60_000)) {
    return Errors.tooManyRequests()
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Errors.validation("Gagal membaca form data")
  }

  const file = formData.get("file") as File | null
  if (!file || file.size === 0) {
    return Errors.validation("File tidak disertakan")
  }

  try {
    const { tempId, fileName } = await saveTempFile(file)
    return NextResponse.json({ fileId: tempId, fileName }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal menyimpan file"
    return Errors.validation(message)
  }
}
