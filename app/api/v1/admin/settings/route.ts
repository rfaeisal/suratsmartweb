import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { invalidateSettingsCache } from "@/lib/settings"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

type SettingMeta = {
  label: string
  default: string
  type: "boolean" | "number"
  description?: string
  min?: number
  max?: number
}

const KNOWN_SETTINGS: Record<string, SettingMeta> = {
  enforce_single_session: {
    label: "Satu sesi aktif per akun mobile",
    default: "true",
    type: "boolean",
    description:
      "Jika aktif, login dari perangkat baru akan diblokir selama masih ada sesi aktif — admin atau superadmin harus mencabut sesi lama terlebih dahulu. Berlaku untuk aplikasi mobile saja.",
  },
  device_binding_enabled: {
    label: "Aktifkan binding perangkat (anti titip absen)",
    default: "true",
    type: "boolean",
    description:
      "Jika aktif, satu akun hanya bisa absen dari perangkat yang sama dengan sesi aktifnya. Login dari perangkat berbeda akan ditolak (409 device_conflict).",
  },
  toleransi_telat_menit: {
    label: "Toleransi keterlambatan (menit)",
    default: "15",
    type: "number",
    description: "Jumlah menit setelah jam masuk shift yang masih dianggap tepat waktu. Lewat dari batas ini, absen masuk dianggap terlambat.",
    min: 0,
    max: 120,
  },
  interval_rotasi_detik: {
    label: "Interval rotasi QR perangkat absensi (detik)",
    default: "30",
    type: "number",
    description: "Seberapa sering token QR pada perangkat absensi ESP32 diperbarui. Nilai lebih kecil = lebih aman, tapi butuh sinkronisasi NTP yang baik.",
    min: 10,
    max: 300,
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
    type: meta.type,
    description: meta.description ?? null,
    min: meta.min ?? null,
    max: meta.max ?? null,
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
  const meta = KNOWN_SETTINGS[key]
  if (!meta) return Errors.notFound("Pengaturan")

  // Validasi tipe
  if (meta.type === "boolean" && value !== "true" && value !== "false") {
    return Errors.validation("Nilai harus 'true' atau 'false'")
  }
  if (meta.type === "number") {
    const num = parseInt(value, 10)
    if (isNaN(num)) return Errors.validation("Nilai harus berupa angka")
    if (meta.min !== undefined && num < meta.min) return Errors.validation(`Nilai minimal ${meta.min}`)
    if (meta.max !== undefined && num > meta.max) return Errors.validation(`Nilai maksimal ${meta.max}`)
  }

  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, label: meta.label },
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
