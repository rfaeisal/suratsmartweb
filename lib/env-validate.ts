// Dipanggil saat startup untuk memastikan semua env vars kritis tersedia.
// Tidak throw di development untuk kemudahan, hanya warn.
const REQUIRED_PRODUCTION = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "LEGACY_API_BASE_URL",
  "LEGACY_API_KEY",
  "LEGACY_API_HMAC_SECRET",
  "FILE_STORAGE_PATH",
]

const WEAK_DEFAULTS = [
  "cutismart-dev-secret-change-in-production",
  "dev-secret",
  "dev-api-key",
  "dev-hmac-secret",
]

export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return

  const missing = REQUIRED_PRODUCTION.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `[env] Variabel berikut harus diisi di production: ${missing.join(", ")}`
    )
  }

  for (const key of ["NEXTAUTH_SECRET", "LEGACY_API_HMAC_SECRET"]) {
    const val = process.env[key]
    if (val && WEAK_DEFAULTS.includes(val)) {
      throw new Error(
        `[env] ${key} masih menggunakan nilai default yang tidak aman. Ganti sebelum deploy.`
      )
    }
  }
}
