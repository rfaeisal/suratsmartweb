import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AttendanceQrClient from "./AttendanceQrClient"

export default async function DevAttendanceQrPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.roles?.includes("SUPERADMIN")) redirect("/unauthorized")
  return <AttendanceQrClient />
}
