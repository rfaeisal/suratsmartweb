import { redirect } from "next/navigation"
import { auth } from "@/auth"

export default async function HomePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  const roles = session.user.roles
  if (roles.includes("ADMIN_KEPEGAWAIAN") || roles.includes("SUPERADMIN")) {
    redirect("/admin/dashboard")
  }

  redirect("/pegawai/dashboard")
}
