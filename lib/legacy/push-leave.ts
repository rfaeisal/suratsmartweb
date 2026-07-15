import { prisma } from "@/lib/prisma"
import { createHmac } from "crypto"

interface PushLeavePayload {
  requestNumber: string
  employeeLegacyId: string
  leaveTypeCode: string
  leaveTypeName: string
  startDate: string
  endDate: string
  totalDays: number
  skNumber: string
  skFileUrl: string
  delegateEmployeeLegacyId: string | null
  approvalTrail: {
    roleLabel: string
    approverLegacyId: string
    decidedAt: string
  }[]
}

function buildLegacyHeaders(body: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac("sha256", process.env.LEGACY_API_HMAC_SECRET ?? "")
    .update(timestamp + body)
    .digest("hex")
  return {
    "Content-Type": "application/json",
    "X-API-Key": process.env.LEGACY_API_KEY ?? "",
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  }
}

export async function pushLeaveToLegacy(leaveRequestId: string): Promise<void> {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      requester: { select: { legacyId: true } },
      leaveType: { select: { code: true, name: true } },
      delegate: { select: { legacyId: true } },
      skDocument: { select: { skNumber: true } },
      approvalSteps: {
        where: { status: "APPROVED" },
        include: { approver: { select: { legacyId: true } } },
        orderBy: { stepOrder: "asc" },
      },
    },
  })

  if (!req) throw new Error("Pengajuan tidak ditemukan")
  if (!req.skDocument) throw new Error("SK belum digenerate")

  // Buat atau ambil IntegrationLog yang ada
  let log = await prisma.integrationLog.findFirst({
    where: { leaveRequestId, direction: "PUSH_LEAVE_TO_LEGACY" },
    orderBy: { createdAt: "desc" },
  })

  const skFileUrl = `${process.env.NEXTAUTH_URL ?? ""}/api/v1/admin/leave-requests/${leaveRequestId}/sk/download`

  const payload: PushLeavePayload = {
    requestNumber: req.requestNumber,
    employeeLegacyId: req.requester.legacyId,
    leaveTypeCode: req.leaveType.code,
    leaveTypeName: req.leaveType.name,
    startDate: req.startDate.toISOString().split("T")[0],
    endDate: req.endDate.toISOString().split("T")[0],
    totalDays: req.totalDays,
    skNumber: req.skDocument.skNumber,
    skFileUrl,
    delegateEmployeeLegacyId: req.delegate?.legacyId ?? null,
    approvalTrail: req.approvalSteps.map((s) => ({
      roleLabel: s.roleLabel,
      approverLegacyId: s.approver.legacyId,
      decidedAt: s.decidedAt?.toISOString() ?? "",
    })),
  }
  const bodyStr = JSON.stringify(payload)

  if (!log) {
    log = await prisma.integrationLog.create({
      data: {
        leaveRequestId,
        direction: "PUSH_LEAVE_TO_LEGACY",
        status: "PENDING",
        requestPayload: payload as unknown as import("@prisma/client").Prisma.InputJsonValue,
        attemptCount: 0,
      },
    })
  }

  await prisma.integrationLog.update({
    where: { id: log.id },
    data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
  })

  if (process.env.LEGACY_SSO_MOCK === "true") {
    // Mode mock: selalu sukses
    await prisma.integrationLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", responsePayload: { success: true, legacyLeaveRecordId: "MOCK-001" } },
    })
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "SENT_TO_LEGACY" },
    })
    return
  }

  try {
    const response = await fetch(
      `${process.env.LEGACY_API_BASE_URL ?? ""}/api/leave/approved`,
      {
        method: "POST",
        body: bodyStr,
        headers: buildLegacyHeaders(bodyStr),
        signal: AbortSignal.timeout(15000),
      }
    )

    const responseJson = await response.json() as { success: boolean; legacyLeaveRecordId?: string; errorCode?: string; message?: string }

    if (response.ok && responseJson.success) {
      await prisma.integrationLog.update({
        where: { id: log.id },
        data: { status: "SUCCESS", responsePayload: responseJson },
      })
      await prisma.leaveRequest.update({
        where: { id: leaveRequestId },
        data: { status: "SENT_TO_LEGACY" },
      })
    } else {
      await prisma.integrationLog.update({
        where: { id: log.id },
        data: { status: "FAILED", responsePayload: responseJson },
      })
      await prisma.leaveRequest.update({
        where: { id: leaveRequestId },
        data: { status: "SEND_FAILED" },
      })
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await prisma.integrationLog.update({
      where: { id: log.id },
      data: { status: "FAILED", responsePayload: { error: errMsg } },
    })
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "SEND_FAILED" },
    })
    throw err
  }
}
