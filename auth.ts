import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { validateSSOCredentials } from "@/lib/legacy/client"
import { syncEmployeeFromLegacy } from "@/lib/auth/sync-employee"
import { prisma } from "@/lib/prisma"
import type { AppRole } from "@prisma/client"

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

        const result = await validateSSOCredentials(
          credentials.username as string,
          credentials.password as string,
        )
        if (!result.valid) return null

        const employee = await syncEmployeeFromLegacy(result.employee)

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
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.roles = user.roles
        token.employeeId = user.employeeId
        token.unitId = user.unitId
        token.nip = user.nip
      }
      // Migrate token lama yang masih pakai field `role` (singular)
      if (!token.roles && token.role) {
        token.roles = [token.role]
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.roles = (token.roles as AppRole[]) ?? (token.role ? [token.role as AppRole] : ["PEGAWAI"])
        session.user.employeeId = token.employeeId as string
        session.user.unitId = token.unitId as string | null
        session.user.nip = token.nip as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
})
