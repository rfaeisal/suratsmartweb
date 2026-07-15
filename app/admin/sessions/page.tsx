import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { writeAuditLog } from "@/lib/audit"
import SessionsClient from "./SessionsClient"

async function revokeSession(sessionId: string, adminUserId: string) {
  "use server"
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { status: "REVOKED", revokedAt: new Date(), revokedBy: adminUserId },
  })
  await writeAuditLog({
    actorId: adminUserId,
    action: "FORCE_REVOKE_SESSION",
    entityType: "UserSession",
    entityId: sessionId,
  })
  revalidatePath("/admin/sessions")
}

export default async function SessionsPage() {
  const session = await auth()
  if (!session?.user?.roles.includes("SUPERADMIN")) redirect("/admin/dashboard")

  const adminUserId = session!.user.id

  const activeSessions = await prisma.userSession.findMany({
    where: { status: "ACTIVE" },
    include: {
      user: {
        include: {
          employee: { select: { nip: true, fullName: true, unit: { select: { name: true } } } },
        },
      },
    },
    orderBy: { lastActiveAt: "desc" },
  })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Manajemen Sesi Login</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pantau dan kelola sesi login aktif pegawai. Gunakan untuk force sign-out jika pegawai
          kehilangan perangkat atau perlu pindah device.
        </p>
      </div>

      <SessionsClient
        sessions={activeSessions}
        adminUserId={adminUserId}
        revokeAction={revokeSession}
      />
    </div>
  )
}
