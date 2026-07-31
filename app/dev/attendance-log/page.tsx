import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AttendanceLogClient from "./AttendanceLogClient"

export default async function DevAttendanceLogPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.roles?.includes("SUPERADMIN")) redirect("/unauthorized")
  return <AttendanceLogClient />
}
