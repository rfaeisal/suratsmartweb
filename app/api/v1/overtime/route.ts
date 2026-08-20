import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import { sendNotification } from "@/lib/notifications"

const createSchema = z.object({
  tanggal_kerja: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
})

export async function GET(req: NextRequest) {
  let auth
  try {
    auth = await requireAuth(req)
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const workUnitId = searchParams.get("work_unit_id")

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (workUnitId) where.workUnitId = workUnitId

  if (auth.roles.includes("PEGAWAI") && !auth.roles.some((r) => ["KEPALA_UNIT", "ADMIN_KEPEGAWAIAN", "SUPERADMIN"].includes(r))) {
    where.employeeId = auth.employeeId
  } else if (auth.roles.includes("KEPALA_UNIT") && !auth.roles.some((r) => ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"].includes(r))) {
    where.workUnitId = auth.managedWorkUnitId ?? "__none__"
  }

  const overtimes = await prisma.overtime.findMany({
    where,
    include: {
      employee: { select: { id: true, fullName: true, nip: true } },
      workUnit: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ data: overtimes })
}

export async function POST(req: NextRequest) {
  let auth
  try {
    auth = await requireAuth(req, ["PEGAWAI"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const body = await req.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  const employee = await prisma.employee.findUnique({
    where: { id: auth.employeeId },
    select: { unitId: true },
  })
  if (!employee?.unitId) return Errors.validation("Pegawai belum memiliki unit kerja")

  const tanggalKerja = new Date(parsed.data.tanggal_kerja + "T00:00:00Z")

  const overtime = await prisma.overtime.create({
    data: {
      employeeId: auth.employeeId,
      workUnitId: employee.unitId,
      tanggalKerja,
      note: parsed.data.note,
    },
    include: {
      employee: { select: { id: true, fullName: true, nip: true } },
      workUnit: { select: { id: true, name: true } },
    },
  })

  // Notif FCM ke Kepala Unit — non-blocking, kegagalan notif tidak
  // boleh menggagalkan pengajuan.
  try {
    const kepalaUsers = await prisma.appUser.findMany({
      where: { managedWorkUnitId: employee.unitId, roles: { has: "KEPALA_UNIT" } },
      select: { id: true },
    })
    await Promise.all(
      kepalaUsers.map((u) =>
        sendNotification({
          event: "OVERTIME_APPROVAL_REQUESTED",
          targetUserId: u.id,
          data: {
            overtimeId: overtime.id,
            employeeId: overtime.employee.id,
            employeeName: overtime.employee.fullName,
            unitName: overtime.workUnit.name,
            tanggalKerja: overtime.tanggalKerja.toISOString().slice(0, 10),
          },
        }),
      ),
    )
  } catch (err) {
    console.error("[overtime] Gagal kirim notif approval:", err)
  }

  return NextResponse.json(overtime, { status: 201 })
}
