import { prisma } from "@/lib/prisma"
import PositionsClient from "./PositionsClient"

export default async function PositionsPage() {
  const positions = await prisma.position.findMany({
    orderBy: [{ level: "desc" }, { name: "asc" }],
  })

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-5">Master Jabatan</h1>
      <p className="text-sm text-gray-500 mb-6">
        Daftar jabatan yang digunakan sebagai referensi hierarki persetujuan.
        Level lebih besar berarti jabatan lebih tinggi dalam struktur organisasi.
      </p>
      <PositionsClient initial={positions} />
    </div>
  )
}
