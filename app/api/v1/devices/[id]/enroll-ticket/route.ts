import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { writeAuditLog } from "@/lib/audit"
import { Errors } from "@/lib/errors"

const ENROLL_TTL_MINUTES = 15

function generateEnrollCode(): string {
  // 8 karakter A-Z0-9, mudah dibaca (tanpa 0/O/1/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = randomBytes(8)
  let out = ""
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let authUser
  try {
    authUser = await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const device = await prisma.device.findUnique({ where: { id } })
  if (!device) return Errors.notFound("Perangkat")

  let code = ""
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateEnrollCode()
    const existing = await prisma.device.findUnique({ where: { enrollCode: code } })
    if (!existing) break
    if (attempt === 4) return Errors.internal()
  }

  const expiresAt = new Date(Date.now() + ENROLL_TTL_MINUTES * 60 * 1000)

  await prisma.device.update({
    where: { id },
    data: { enrollCode: code, enrollCodeExpiresAt: expiresAt },
  })

  await writeAuditLog({
    actorId: authUser.userId,
    action: "DEVICE_ENROLL_TICKET_ISSUED",
    entityType: "Device",
    entityId: device.id,
    metadata: { device_id: device.deviceId, expires_at: expiresAt.toISOString() },
  })

  return NextResponse.json({
    enroll_code: code,
    expires_at: expiresAt.toISOString(),
    ttl_seconds: ENROLL_TTL_MINUTES * 60,
  })
}
