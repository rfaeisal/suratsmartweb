import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import SyncEmployeesForm from "./SyncEmployeesForm"

export default async function SyncPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    redirect("/pegawai/dashboard")
  }

  const units = await prisma.workUnit.findMany({ orderBy: { name: "asc" } })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Sinkronisasi Data Pegawai</h1>
      <p className="text-sm text-gray-500 mb-6">
        Tarik data pegawai terbaru dari sistem kepegawaian lama ke database CutiSmart.
        Data yang sudah ada akan diperbarui, data baru akan ditambahkan.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>Catatan:</strong> Sinkronisasi otomatis terjadi setiap kali pegawai login.
        Gunakan fitur ini untuk sinkronisasi massal — misalnya saat pertama kali setup,
        atau setelah ada perubahan data besar di sistem lama.
      </div>

      <SyncEmployeesForm units={units} />
    </div>
  )
}
