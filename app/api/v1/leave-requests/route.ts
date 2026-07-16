import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"
import {
  calculateTotalDays,
  generateRequestNumber,
  checkQuota,
} from "@/lib/leave-request-utils"
import { moveTempToFinal, getTempFile } from "@/lib/upload"

const createSchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal: YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal: YYYY-MM-DD"),
  reason: z.string().min(5, "Alasan minimal 5 karakter"),
  addressDuringLeave: z.string().min(5, "Alamat minimal 5 karakter").optional(),
  emergencyPhone: z.string().max(20).optional(),
  delegateEmployeeId: z.string().min(1),
  attachmentFileIds: z.array(z.string()).default([]),
})

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const isAdmin = user.roles.includes("ADMIN_KEPEGAWAIAN") || user.roles.includes("SUPERADMIN")
  // mine=false (lihat semua) hanya untuk admin
  const mine = isAdmin ? searchParams.get("mine") !== "false" : true

  const requests = await prisma.leaveRequest.findMany({
    where: {
      ...(mine && { requesterId: user.employeeId }),
      ...(status && { status: status as never }),
    },
    include: {
      leaveType: { select: { code: true, name: true } },
      delegate: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(requests)
}

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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Data tidak valid", parsed.error.flatten().fieldErrors)
  }

  const { leaveTypeId, startDate, endDate, reason, addressDuringLeave, emergencyPhone, delegateEmployeeId, attachmentFileIds } =
    parsed.data

  const start = new Date(startDate)
  const end = new Date(endDate)

  let totalDays: number
  try {
    totalDays = calculateTotalDays(start, end)
  } catch (err) {
    return Errors.validation(err instanceof Error ? err.message : "Tanggal tidak valid")
  }

  // Validasi jenis cuti
  const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } })
  if (!leaveType || !leaveType.isActive) return Errors.notFound("Jenis cuti")

  const employee = await prisma.employee.findUnique({ where: { id: user.employeeId } })
  if (!employee) return Errors.notFound("Pegawai")

  if (!leaveType.applicableTo.includes(employee.employeeType)) {
    return Errors.validation(`Jenis cuti '${leaveType.name}' tidak berlaku untuk ${employee.employeeType}`)
  }

  // Validasi lampiran wajib
  if (leaveType.requiresAttachment && attachmentFileIds.length === 0) {
    return Errors.validation(`Jenis cuti '${leaveType.name}' wajib menyertakan lampiran`)
  }

  // Validasi file temp masih ada
  for (const fid of attachmentFileIds) {
    if (!getTempFile(fid)) {
      return Errors.validation(`File dengan ID '${fid}' tidak ditemukan atau sudah kedaluwarsa`)
    }
  }

  // Validasi delegasi
  if (delegateEmployeeId === user.employeeId) {
    return Errors.validation("Tidak dapat menunjuk diri sendiri sebagai pengganti")
  }
  const delegate = await prisma.employee.findFirst({
    where: { id: delegateEmployeeId, unitId: employee.unitId, isActive: true },
  })
  if (!delegate) {
    return Errors.notFound("Pegawai pengganti (harus dari unit yang sama dan masih aktif)")
  }

  // Validasi kuota
  const quota = await checkQuota(user.employeeId, leaveTypeId, totalDays)
  if (!quota.sufficient) {
    return Errors.validation(
      `Sisa kuota tidak cukup. Sisa: ${quota.remaining} hari, diminta: ${totalDays} hari`,
    )
  }

  // Buat pengajuan
  const requestNumber = await generateRequestNumber()

  const leaveRequest = await prisma.$transaction(async (tx) => {
    const req = await tx.leaveRequest.create({
      data: {
        requestNumber,
        requesterId: user.employeeId,
        leaveTypeId,
        startDate: start,
        endDate: end,
        totalDays,
        reason,
        addressDuringLeave: addressDuringLeave ?? null,
        emergencyPhone: emergencyPhone ?? null,
        delegateId: delegateEmployeeId,
        status: "SUBMITTED",
        delegateConfirmationStatus: "PENDING",
      },
    })

    // Pindahkan file dari temp ke final & simpan record
    for (const tempId of attachmentFileIds) {
      const info = getTempFile(tempId)
      if (!info) continue
      const finalPath = await moveTempToFinal(tempId, info.fileName, req.id)
      await tx.leaveAttachment.create({
        data: { leaveRequestId: req.id, fileName: info.fileName, filePath: finalPath },
      })
    }

    return req
  })

  await writeAuditLog({
    actorId: user.userId,
    action: "SUBMIT_LEAVE_REQUEST",
    entityType: "LeaveRequest",
    entityId: leaveRequest.id,
    metadata: { requestNumber, leaveTypeId, totalDays },
  })

  // Cari AppUser delegasi untuk notifikasi
  const delegateUser = await prisma.appUser.findUnique({
    where: { employeeId: delegateEmployeeId },
  })
  if (delegateUser) {
    await sendNotification({
      event: "DELEGATE_REQUESTED",
      targetUserId: delegateUser.id,
      data: {
        requesterName: employee.fullName,
        leaveType: leaveType.name,
        startDate,
        endDate,
      },
    })
  }

  return NextResponse.json(leaveRequest, { status: 201 })
}
