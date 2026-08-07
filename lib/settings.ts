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
