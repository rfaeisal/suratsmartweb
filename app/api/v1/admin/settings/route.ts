import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { invalidateSettingsCache } from "@/lib/settings"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

const KNOWN_SETTINGS: Record<string, { label: string; default: string }> = {
  enforce_single_session: {
    label: "Satu sesi aktif per akun mobile",
    default: "true",
  },
}

async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user) throw new Error("UNAUTHORIZED")
  if (!session.user.roles.includes("SUPERADMIN")) throw new Error("FORBIDDEN")
  return session
}

export async function GET() {
  try { await requireSuperAdmin() } catch (e) {
    return (e as Error).message === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized()
  }

  const rows = await prisma.appSetting.findMany()
  const rowMap = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  const settings = Object.entries(KNOWN_SETTINGS).map(([key, meta]) => ({
    key,
    label: meta.label,
    value: rowMap[key] ?? meta.default,
  }))

  return NextResponse.json({ settings })
}

const updateSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
})

export async function PUT(req: NextRequest) {
  let session
  try { session = await requireSuperAdmin() } catch (e) {
    return (e as Error).message === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized()
  }

  let body: unknown
  try { body = await req.json() } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Format tidak valid")

  const { key, value } = parsed.data
  if (!(key in KNOWN_SETTINGS)) return Errors.notFound("Pengaturan")

  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, label: KNOWN_SETTINGS[key].label },
    update: { value },
  })

  invalidateSettingsCache()

  await writeAuditLog({
    actorId: session.user.id,
    action: "UPDATE_SYSTEM_SETTING",
    entityType: "AppSetting",
    entityId: key,
    metadata: { key, value },
  })

  return NextResponse.json({ key, value })
}
