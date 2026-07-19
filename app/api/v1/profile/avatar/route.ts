import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { saveAvatar, deleteAvatar } from "@/lib/storage"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"

export async function POST(req: NextRequest) {
  let user
  try {
    user = await requireAuth(req)
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Errors.validation("Request harus berformat multipart/form-data")
  }

  const file = formData.get("file")
  if (!file || !(file instanceof File)) {
    return Errors.validation("Field 'file' diperlukan")
  }

  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { avatarUrl: true },
  })
  if (!employee) return Errors.notFound("Pegawai")

  let avatarUrl: string
  try {
    avatarUrl = await saveAvatar(user.employeeId, file, employee.avatarUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan foto"
    return Errors.validation(msg)
  }

  await prisma.employee.update({
    where: { id: user.employeeId },
    data: { avatarUrl },
  })

  await writeAuditLog({
    actorId: user.employeeId,
    action: "UPDATE_AVATAR",
    entityType: "Employee",
    entityId: user.employeeId,
  })

  return NextResponse.json({ avatarUrl })
}

export async function DELETE(req: NextRequest) {
  let user
  try {
    user = await requireAuth(req)
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { avatarUrl: true },
  })
  if (!employee) return Errors.notFound("Pegawai")
  if (!employee.avatarUrl) return NextResponse.json({ message: "Tidak ada foto profil" })

  await deleteAvatar(employee.avatarUrl)

  await prisma.employee.update({
    where: { id: user.employeeId },
    data: { avatarUrl: null },
  })

  await writeAuditLog({
    actorId: user.employeeId,
    action: "DELETE_AVATAR",
    entityType: "Employee",
    entityId: user.employeeId,
  })

  return NextResponse.json({ message: "Foto profil dihapus" })
}
