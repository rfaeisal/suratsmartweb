import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import type { AppRole } from "@prisma/client"

const updateRolesSchema = z.object({
  roles: z
    .array(z.enum(["PEGAWAI", "APPROVER", "ADMIN_KEPEGAWAIAN", "SUPERADMIN"]))
    .min(1, "Minimal 1 role harus dipilih"),
})

type Props = { params: Promise<{ userId: string }> }

// GET /api/v1/admin/users/[userId]/roles — lihat roles user
export async function GET(_req: NextRequest, { params }: Props) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    return Errors.forbidden()
  }

  const { userId: id } = await params
  const user = await prisma.appUser.findUnique({
    where: { id },
    select: {
      id: true,
      roles: true,
      employee: { select: { fullName: true, nip: true } },
    },
  })
  if (!user) return Errors.notFound("User")

  return NextResponse.json(user)
}

// PUT /api/v1/admin/users/[userId]/roles — set roles user (replace semua)
export async function PUT(req: NextRequest, { params }: Props) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    return Errors.forbidden()
  }

  const { userId: id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = updateRolesSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Format data tidak valid", parsed.error.flatten().fieldErrors)
  }

  const targetUser = await prisma.appUser.findUnique({ where: { id } })
  if (!targetUser) return Errors.notFound("User")

  // SUPERADMIN hanya bisa diubah oleh SUPERADMIN
  const isSuperadminTarget = targetUser.roles.includes("SUPERADMIN")
  const actorIsSuperadmin = session.user.roles.includes("SUPERADMIN")
  if (isSuperadminTarget && !actorIsSuperadmin) {
    return Errors.forbidden()
  }
  // Jika akan memberi role SUPERADMIN, harus SUPERADMIN
  if (parsed.data.roles.includes("SUPERADMIN") && !actorIsSuperadmin) {
    return Errors.forbidden()
  }

  const updatedUser = await prisma.appUser.update({
    where: { id },
    data: { roles: parsed.data.roles as AppRole[] },
    select: {
      id: true,
      roles: true,
      employee: { select: { fullName: true, nip: true } },
    },
  })

  await writeAuditLog({
    actorId: session.user.id,
    action: "UPDATE_USER_ROLES",
    entityType: "AppUser",
    entityId: id,
    metadata: { oldRoles: targetUser.roles, newRoles: parsed.data.roles },
  })

  return NextResponse.json(updatedUser)
}
