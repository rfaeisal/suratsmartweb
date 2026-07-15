import { auth } from "@/auth"
import { redirect } from "next/navigation"
import SyncEmployeesForm from "./SyncEmployeesForm"

export default async function SyncPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    redirect("/pegawai/dashboard")
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Sinkronisasi Data Pegawai</h1>
      <p className="text-sm text-gray-500 mb-6">
        Cek dan impor pegawai dari sistem kepegawaian lama yang belum terdaftar di CutiSmart.
        Pencocokan dilakukan berdasarkan NIP — pegawai yang NIP-nya sudah ada di CutiSmart akan diabaikan.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>Catatan:</strong> Data pegawai yang sudah ada tidak akan diubah oleh fitur ini.
        Gunakan saat ada pegawai baru di sistem lama yang belum memiliki akun CutiSmart.
      </div>

      <SyncEmployeesForm />
    </div>
  )
}
