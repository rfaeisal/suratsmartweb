import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { validateSSOCredentials } from "@/lib/legacy/client"
import { syncEmployeeFromLegacy } from "@/lib/auth/sync-employee"
import { prisma } from "@/lib/prisma"
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "@/lib/jwt"
import { writeAuditLog } from "@/lib/audit"
import { Errors } from "@/lib/errors"
import { rateLimit } from "@/lib/rate-limiter"
import { isEnforceSingleSession, isDeviceBindingEnabled } from "@/lib/settings"


const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().min(1),
  deviceLabel: z.string().optional(),
})

export async function POST(req: NextRequest) {
  // 5 percobaan per 15 menit per IP — mencegah brute force
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown"
  if (!rateLimit(`login:${ip}`, 5, 15 * 60_000)) {
    return Errors.tooManyRequests()
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Field tidak lengkap", parsed.error.flatten().fieldErrors)
  }

  const { username, password, deviceId, deviceLabel } = parsed.data

  // 1. Validasi kredensial ke SSO sistem lama
  const ssoResult = await validateSSOCredentials(username, password)
  if (!ssoResult.valid) {
    return Errors.unauthorized("Username atau password salah")
  }

  // 2. Sinkron data pegawai ke database lokal
  const synced = await syncEmployeeFromLegacy(ssoResult.employee)
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { id: synced.id },
    include: { unit: { select: { id: true, name: true } } },
  })

  // Blok pegawai non-aktif — legacy menandai isActive=false berarti tidak boleh
  // login/absen di CutiSmart. Admin harus reaktivasi di sistem lama dulu.
  if (!employee.isActive) {
    return Errors.employeeInactive()
  }

  // 3. Cari atau buat AppUser
  let appUser = await prisma.appUser.findUnique({
    where: { employeeId: employee.id },
  })
  if (!appUser) {
    appUser = await prisma.appUser.create({
      data: { employeeId: employee.id, roles: ["PEGAWAI"] },
    })
  }

  // 4a. Device binding — 1 perangkat per akun (untuk absensi).
  // Kalau ada sesi ACTIVE di device BEDA → tolak (device conflict).
  if (await isDeviceBindingEnabled()) {
    const otherDeviceSession = await prisma.userSession.findFirst({
      where: {
        userId: appUser.id,
        status: "ACTIVE",
        deviceId: { not: deviceId },
      },
      select: { deviceLabel: true },
    })
    if (otherDeviceSession) {
      return Errors.deviceConflict(otherDeviceSession.deviceLabel ?? undefined)
    }
  } else if (await isEnforceSingleSession()) {
    // 4b. Fallback: blokir sesi ganda tanpa mempertimbangkan device.
    const activeSession = await prisma.userSession.findFirst({
      where: { userId: appUser.id, status: "ACTIVE" },
    })
    if (activeSession) {
      return Errors.sessionAlreadyActive(
        activeSession.deviceLabel ?? undefined,
        activeSession.createdAt,
      )
    }
  }

  // 4c. Revoke SEMUA sesi ACTIVE lama untuk user ini — self-healing supaya
  // sesi tidak menumpuk. updateMany (bukan findFirst+update) supaya bereskan
  // kasus di mana user existing sudah punya >1 sesi ACTIVE dari kondisi
  // sebelum fix ini. Dijalankan terlepas dari setting di atas.
  await prisma.userSession.updateMany({
    where: { userId: appUser.id, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date(), revokedBy: "SELF" },
  })

  // 5. Buat sesi baru
  const refreshToken = generateRefreshToken()
  const refreshTokenHash = hashRefreshToken(refreshToken)

  const session = await prisma.userSession.create({
    data: {
      userId: appUser.id,
      deviceId,
      deviceLabel,
      refreshTokenHash,
      status: "ACTIVE",
    },
  })

  // 6. Terbitkan access token
  const accessToken = await signAccessToken({
    userId: appUser.id,
    sessionId: session.id,
    roles: appUser.roles,
    employeeId: employee.id,
  })

  await writeAuditLog({
    actorId: appUser.id,
    action: "LOGIN",
    entityType: "UserSession",
    entityId: session.id,
    metadata: { deviceId, deviceLabel },
  })

  return NextResponse.json({
    accessToken,
    refreshToken,
    user: {
      id: appUser.id,
      nip: employee.nip,
      fullName: employee.fullName,
      employeeType: employee.employeeType,
      roles: appUser.roles,
      unit: employee.unit ? { id: employee.unit.id, name: employee.unit.name } : null,
    },
  })
}
