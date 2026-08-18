import { prisma } from "./prisma"

const cache = new Map<string, { value: string; expiresAt: number }>()
const CACHE_TTL = 30_000 // 30 detik

async function getSetting(key: string, defaultValue: string): Promise<string> {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.value
  const row = await prisma.appSetting.findUnique({ where: { key } })
  const value = row?.value ?? defaultValue
  cache.set(key, { value, expiresAt: now + CACHE_TTL })
  return value
}

export function invalidateSettingsCache() {
  cache.clear()
}

export async function isEnforceSingleSession(): Promise<boolean> {
  const val = await getSetting("enforce_single_session", "true")
  return val === "true"
}

export async function isDeviceBindingEnabled(): Promise<boolean> {
  const val = await getSetting("device_binding_enabled", "true")
  return val === "true"
}

export async function isBeaconVerificationEnabled(): Promise<boolean> {
  const val = await getSetting("beacon_verification_enabled", "true")
  return val === "true"
}

export async function getAttendanceSettings(): Promise<{
  toleransiTelatMenit: number
  intervalRotasiDetik: number
}> {
  const [toleransi, interval] = await Promise.all([
    getSetting("toleransi_telat_menit", "15"),
    getSetting("interval_rotasi_detik", "30"),
  ])
  return {
    toleransiTelatMenit: parseInt(toleransi, 10),
    intervalRotasiDetik: parseInt(interval, 10),
  }
}

/**
 * Face verification aktif per unit. Value setting berupa JSON array unitId.
 * Kalau unit tidak ada di list, absen tidak butuh face check.
 * Kalau ada, absen wajib sertakan face_embedding + liveness_score.
 */
export async function getFaceVerificationUnits(): Promise<string[]> {
  const val = await getSetting("face_verification_required_units", "[]")
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

export async function isFaceVerificationRequiredForUnit(
  unitId: string | null | undefined,
): Promise<boolean> {
  if (!unitId) return false
  const units = await getFaceVerificationUnits()
  return units.includes(unitId)
}

export async function getFaceMatchThreshold(): Promise<number> {
  const val = await getSetting("face_match_threshold", "0.65")
  const n = parseFloat(val)
  return Number.isFinite(n) ? n : 0.65
}

export async function getLivenessThreshold(): Promise<number> {
  const val = await getSetting("face_liveness_threshold", "0.5")
  const n = parseFloat(val)
  return Number.isFinite(n) ? n : 0.5
}
