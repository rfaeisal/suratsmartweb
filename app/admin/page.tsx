import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AdminRootPage() {
  const session = await auth()
  const roles = session?.user?.roles ?? []

  if (roles.includes("ADMIN_KEPEGAWAIAN") || roles.includes("SUPERADMIN")) {
    redirect("/admin/dashboard")
  }
  if (roles.includes("KEPALA_UNIT") || roles.includes("ADMIN_UNIT")) {
    redirect("/admin/attendance/roster")
  }
  redirect("/login")
}
