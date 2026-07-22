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
