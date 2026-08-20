import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { validateSSOCredentials } from "@/lib/legacy/client"
import { syncEmployeeFromLegacy } from "@/lib/auth/sync-employee"
import { prisma } from "@/lib/prisma"
import type { AppRole } from "@prisma/client"

// Web (admin panel) session policy:
// - Idle timeout: cookie mati kalau tidak ada request selama SESSION_IDLE_SECONDS.
// - Absolute timeout: session paling lama SESSION_ABSOLUTE_SECONDS sejak login;
//   setelah lewat, JWT dibuat invalid meski cookie belum expired.
// Mobile pakai jalur Bearer token custom (lib/jwt.ts) dan TIDAK terpengaruh
// setting ini — sesi mobile hanya bisa berakhir via admin revoke.
const SESSION_IDLE_SECONDS = 30 * 60          // 30 menit
const SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60  // 8 jam

// Default roles untuk akun mock tertentu (hanya berlaku saat LEGACY_SSO_MOCK=true)
const MOCK_DEFAULT_ROLES: Record<string, AppRole[]> = {
  "9998": ["PEGAWAI", "SUPERADMIN", "ADMIN_KEPEGAWAIAN"],
  "9999": ["PEGAWAI", "ADMIN_KEPEGAWAIAN"],
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        try {
          const result = await validateSSOCredentials(
            credentials.username as string,
            credentials.password as string,
          )
          if (!result.valid) return null

          const employee = await syncEmployeeFromLegacy(result.employee)

          // Blok pegawai non-aktif — legacy menandai isActive=false berarti
          // tidak boleh login ke CutiSmart. Reaktivasi harus dari sistem lama.
          if (!employee.isActive) {
            console.warn(
              `[auth.authorize] login ditolak — pegawai non-aktif: ${result.employee.legacyId} ${result.employee.fullName}`,
            )
            return null
          }

          let appUser = await prisma.appUser.findUnique({
            where: { employeeId: employee.id },
            include: { employee: { include: { unit: true } } },
          })

          const username = credentials.username as string
          if (!appUser) {
            const isMock = process.env.LEGACY_SSO_MOCK === "true"
            const defaultRoles: AppRole[] =
              isMock && result.employee.legacyId && MOCK_DEFAULT_ROLES[result.employee.legacyId]
                ? MOCK_DEFAULT_ROLES[result.employee.legacyId]
                : ["PEGAWAI"]
            appUser = await prisma.appUser.create({
              data: { employeeId: employee.id, roles: defaultRoles, username },
              include: { employee: { include: { unit: true } } },
            })
          } else if (appUser.username !== username) {
            await prisma.appUser.update({
              where: { id: appUser.id },
              data: { username },
            })
            appUser = { ...appUser, username }
          }

          return {
            id: appUser.id,
            name: employee.fullName,
            email: `${employee.nip}@cutismart.internal`,
            roles: appUser.roles,
            employeeId: employee.id,
            unitId: employee.unitId,
            nip: employee.nip,
          }
        } catch (err) {
          console.error("[auth.authorize] gagal:", err instanceof Error ? err.message : err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      const nowSec = Math.floor(Date.now() / 1000)

      if (user) {
        // Fresh login — stamp login time supaya absolute expiry bisa dihitung.
        token.id = user.id
        token.roles = user.roles
        token.employeeId = user.employeeId
        token.unitId = user.unitId
        token.nip = user.nip
        token.loginAt = nowSec
      }
      // Migrate token lama yang masih pakai field `role` (singular)
      if (!token.roles && token.role) {
        token.roles = [token.role]
      }

      // Absolute expiry — token yang lebih tua dari SESSION_ABSOLUTE_SECONDS
      // sejak login pertama dianggap invalid, meski cookie belum expired.
      // Kalau token lama (belum punya loginAt), pakai token.iat sebagai proxy.
      const loginAt = (token.loginAt as number | undefined) ?? (token.iat as number | undefined)
      if (loginAt && nowSec - loginAt > SESSION_ABSOLUTE_SECONDS) {
        // Kembalikan token kosong → next-auth akan anggap unauthenticated.
        return {}
      }
      return token
    },
    session({ session, token }) {
      if (!token || !token.id) {
        // Absolute expiry sudah trigger — kosongkan user supaya check
        // `if (!session?.user)` di layout admin/pegawai redirect ke /login.
        // Return session tanpa user (cast karena TypeScript strict soal ini).
        return { ...session, user: undefined as unknown as typeof session.user }
      }
      session.user.id = token.id as string
      session.user.roles = (token.roles as AppRole[]) ?? (token.role ? [token.role as AppRole] : ["PEGAWAI"])
      session.user.employeeId = token.employeeId as string
      session.user.unitId = token.unitId as string | null
      session.user.nip = token.nip as string
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Cookie maxAge = idle timeout (sliding). Kalau tidak ada request selama
  // durasi ini, cookie expired → user harus login ulang. Absolute expiry
  // (8 jam) di-enforce lewat callback `jwt` di atas (cek loginAt).
  session: {
    strategy: "jwt",
    maxAge: SESSION_IDLE_SECONDS,
    updateAge: 5 * 60, // refresh cookie setiap 5 menit user aktif
  },
  jwt: {
    maxAge: SESSION_IDLE_SECONDS,
  },
})
