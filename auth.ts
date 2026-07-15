import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { validateSSOCredentials } from "@/lib/legacy/client"
import { syncEmployeeFromLegacy } from "@/lib/auth/sync-employee"
import { prisma } from "@/lib/prisma"
import type { AppRole } from "@prisma/client"

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

        if (!appUser) {
          appUser = await prisma.appUser.create({
            data: { employeeId: employee.id, roles: ["PEGAWAI"] },
            include: { employee: { include: { unit: true } } },
          })
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
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.roles = token.roles as AppRole[]
        session.user.employeeId = token.employeeId as string
        session.user.unitId = token.unitId as string
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
