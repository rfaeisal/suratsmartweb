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
  type: "boolean" | "number" | "float" | "unit_multiselect"
  description?: string
  min?: number
  max?: number
  step?: number
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
  beacon_verification_enabled: {
    label: "Verifikasi beacon iBeacon (anti-relay)",
    default: "true",
    type: "boolean",
    description:
      "Jika aktif, absen ditolak bila aplikasi tidak mendeteksi sinyal iBeacon dari perangkat absensi. Matikan sementara selama uji coba sebelum device beacon fisik terpasang.",
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
  face_verification_required_units: {
    label: "Unit yang wajib verifikasi wajah",
    default: "[]",
    type: "unit_multiselect",
    description: "Daftar unit yang mengaktifkan face verification saat absen. Pegawai di unit ini wajib enroll wajah dulu (lewat menu Enrollment Wajah).",
  },
  face_match_threshold: {
    label: "Ambang cocok wajah (cosine similarity)",
    default: "0.65",
    type: "float",
    description: "Minimum skor cosine similarity antara wajah live dan wajah enrolled untuk dianggap match. Konservatif = 0.65; ketat = 0.75+.",
    min: 0.3,
    max: 0.95,
    step: 0.05,
  },
  face_liveness_threshold: {
    label: "Ambang liveness score",
    default: "0.5",
    type: "float",
    description: "Minimum skor liveness (passive + challenge kedip/toleh). Naikkan bila banyak fraud lolos; turunkan bila banyak false negative.",
    min: 0.1,
    max: 0.95,
    step: 0.05,
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
    step: meta.step ?? null,
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
  if (meta.type === "float") {
    const num = parseFloat(value)
    if (!Number.isFinite(num)) return Errors.validation("Nilai harus berupa angka desimal")
    if (meta.min !== undefined && num < meta.min) return Errors.validation(`Nilai minimal ${meta.min}`)
    if (meta.max !== undefined && num > meta.max) return Errors.validation(`Nilai maksimal ${meta.max}`)
  }
  if (meta.type === "unit_multiselect") {
    let arr: unknown
    try {
      arr = JSON.parse(value)
    } catch {
      return Errors.validation("Nilai harus JSON array")
    }
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== "string")) {
      return Errors.validation("Nilai harus JSON array of string (unitId)")
    }
    // Cek semua unitId ada — tolak kalau ada yang tidak dikenal.
    if (arr.length > 0) {
      const found = await prisma.workUnit.count({ where: { id: { in: arr as string[] } } })
      if (found !== arr.length) return Errors.validation("Beberapa unitId tidak ditemukan")
    }
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
