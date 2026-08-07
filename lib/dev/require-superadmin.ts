import { auth } from "@/auth"
import { Errors } from "@/lib/errors"

// Guard untuk endpoint dev tools yang boleh diakses SUPERADMIN saja
// (menggantikan gate LEGACY_SSO_MOCK supaya bisa dipakai uji coba di
// environment apa pun sebelum device asli tersedia).
export async function requireSuperAdmin(): Promise<Response | null> {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (!session.user.roles?.includes("SUPERADMIN")) return Errors.forbidden()
  return null
}
