import type { DefaultSession } from "next-auth"
import type { AppRole } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      roles: AppRole[]
      employeeId: string
      unitId: string
      nip: string
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    roles: AppRole[]
    employeeId: string
    unitId: string
    nip: string
    name: string
  }
}
