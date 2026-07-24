import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { getWibDate } from "@/lib/tanggal-kerja"

export interface LeaveRemindersResult {
  startingTomorrow: number
  endingToday: number
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
}

/**
 * Kirim pengingat cuti harian:
 * - "Cuti Anda akan dimulai besok" untuk pengajuan APPROVED dengan startDate = besok WIB
 * - "Cuti Anda berakhir hari ini" untuk pengajuan APPROVED dengan endDate = hari ini WIB
 * Idempoten — memanggil dua kali pada hari yang sama tidak mengirim duplikat
 * karena kondisi tanggal tidak berubah dalam sehari.
 */
export async function sendLeaveReminders(): Promise<LeaveRemindersResult> {
  const today = getWibDate()
  const tomorrow = new Date(today.getTime() + 86_400_000)

  const [startingTomorrowRequests, endingTodayRequests] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: tomorrow },
      select: {
        id: true,
        requestNumber: true,
        startDate: true,
        endDate: true,
        leaveType: { select: { name: true } },
        requester: { select: { id: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", endDate: today },
      select: {
        id: true,
        requestNumber: true,
        startDate: true,
        endDate: true,
        leaveType: { select: { name: true } },
        requester: { select: { id: true } },
      },
    }),
  ])

  const requesterIds = [
    ...startingTomorrowRequests.map((r) => r.requester.id),
    ...endingTodayRequests.map((r) => r.requester.id),
  ]
  const uniqueIds = [...new Set(requesterIds)]

  const appUsers = await prisma.appUser.findMany({
    where: { employeeId: { in: uniqueIds } },
    select: { id: true, employeeId: true },
  })
  const userByEmployeeId = new Map(appUsers.map((u) => [u.employeeId, u.id]))

  let startingTomorrow = 0
  let endingToday = 0

  for (const req of startingTomorrowRequests) {
    const userId = userByEmployeeId.get(req.requester.id)
    if (!userId) continue
    await sendNotification({
      event: "LEAVE_STARTING_TOMORROW",
      targetUserId: userId,
      data: {
        leaveRequestId: req.id,
        requestNumber: req.requestNumber,
        leaveType: req.leaveType.name,
        startDate: formatDate(req.startDate),
        endDate: formatDate(req.endDate),
      },
    })
    startingTomorrow++
  }

  for (const req of endingTodayRequests) {
    const userId = userByEmployeeId.get(req.requester.id)
    if (!userId) continue
    await sendNotification({
      event: "LEAVE_ENDING_TODAY",
      targetUserId: userId,
      data: {
        leaveRequestId: req.id,
        requestNumber: req.requestNumber,
        leaveType: req.leaveType.name,
        startDate: formatDate(req.startDate),
        endDate: formatDate(req.endDate),
      },
    })
    endingToday++
  }

  return { startingTomorrow, endingToday }
}
