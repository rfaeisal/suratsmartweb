import { prisma } from "@/lib/prisma"
import { getFirebaseApp } from "@/lib/firebase"

export type NotifEvent =
  | "DELEGATE_REQUESTED"
  | "DELEGATE_DECLINED"
  | "APPROVAL_REQUESTED"
  | "REQUEST_APPROVED"
  | "REQUEST_REJECTED"
  | "REQUEST_RETURNED"
  | "SEND_TO_LEGACY_FAILED"
  | "LEAVE_STARTING_TOMORROW"
  | "LEAVE_ENDING_TODAY"
  | "SHIFT_SWAP_REQUESTED"
  | "SHIFT_SWAP_PENDING_APPROVAL"
  | "SHIFT_SWAP_APPROVED"
  | "SHIFT_SWAP_REJECTED"
  | "ATTENDANCE_MISSING_CHECKIN"
  | "ATTENDANCE_MISSING_CHECKOUT"
  | "FACE_ENROLLMENT_APPROVED"
  | "FACE_ENROLLMENT_REJECTED"

interface NotifPayload {
  event: NotifEvent
  targetUserId: string
  data: Record<string, string>
}

function buildFcmData(event: NotifEvent, data: Record<string, string>): Record<string, string> {
  switch (event) {
    case "DELEGATE_REQUESTED":
      return {
        ...data,
        type: "DELEGATE_REQUEST",
        title: "Permintaan Jadi Pegawai Pengganti",
        body: `${data.requesterName ?? "Seseorang"} menunjuk Anda sebagai pengganti`,
      }
    case "DELEGATE_DECLINED":
      return {
        ...data,
        type: "STATUS_CHANGE",
        newStatus: "DELEGATE_DECLINED",
        title: "Delegasi Ditolak",
        body: "Pegawai pengganti menolak permintaan delegasi",
      }
    case "APPROVAL_REQUESTED":
      return {
        ...data,
        type: "APPROVAL_NEEDED",
        title: "Pengajuan Cuti Menunggu Persetujuan",
        body: data.requesterName
          ? `${data.requesterName} mengajukan cuti`
          : "Ada pengajuan cuti yang menunggu persetujuan Anda",
      }
    case "REQUEST_APPROVED":
      return {
        ...data,
        type: "STATUS_CHANGE",
        newStatus: "APPROVED",
        title: "Pengajuan Cuti Disetujui",
        body: `${data.requestNumber ?? "Pengajuan Anda"} telah disetujui`,
      }
    case "REQUEST_REJECTED":
      return {
        ...data,
        type: "STATUS_CHANGE",
        newStatus: "REJECTED",
        title: "Pengajuan Cuti Ditolak",
        body: `${data.requestNumber ?? "Pengajuan Anda"} telah ditolak`,
      }
    case "REQUEST_RETURNED":
      return {
        ...data,
        type: "STATUS_CHANGE",
        newStatus: "RETURNED",
        title: "Pengajuan Cuti Dikembalikan",
        body: `${data.requestNumber ?? "Pengajuan Anda"} dikembalikan untuk revisi`,
      }
    case "SEND_TO_LEGACY_FAILED":
      return {
        ...data,
        type: "STATUS_CHANGE",
        newStatus: "SEND_FAILED",
        title: "Gagal Kirim ke EHOS",
        body: `Pengajuan ${data.requestNumber ?? ""} gagal dikirim ke EHOS`.trim(),
      }
    case "LEAVE_STARTING_TOMORROW":
      return {
        ...data,
        type: "LEAVE_REMINDER",
        title: "Pengingat: Cuti Dimulai Besok",
        body: `Cuti ${data.leaveType ?? ""} Anda (${data.requestNumber ?? ""}) dimulai besok, ${data.startDate ?? ""}`.trim(),
      }
    case "LEAVE_ENDING_TODAY":
      return {
        ...data,
        type: "LEAVE_REMINDER",
        title: "Pengingat: Cuti Berakhir Hari Ini",
        body: `Cuti ${data.leaveType ?? ""} Anda (${data.requestNumber ?? ""}) berakhir hari ini, ${data.endDate ?? ""}`.trim(),
      }
    case "SHIFT_SWAP_REQUESTED":
      return {
        ...data,
        type: "SHIFT_SWAP_ACTION",
        action: "RESPOND",
        title: "Permintaan Tukar Shift",
        body: `${data.requesterName ?? "Rekan Anda"} meminta tukar shift dengan Anda (${data.requesterDate ?? ""})`,
      }
    case "SHIFT_SWAP_PENDING_APPROVAL":
      return {
        ...data,
        type: "SHIFT_SWAP_ACTION",
        action: "APPROVE",
        title: "Tukar Shift Menunggu Persetujuan",
        body: `${data.requesterName ?? "Pegawai"} dan ${data.targetName ?? "pengganti"} mengajukan tukar shift`,
      }
    case "SHIFT_SWAP_APPROVED":
      return {
        ...data,
        type: "SHIFT_SWAP_RESULT",
        result: "APPROVED",
        title: "Tukar Shift Disetujui",
        body: "Permintaan tukar shift Anda telah disetujui oleh Kepala Unit",
      }
    case "SHIFT_SWAP_REJECTED":
      return {
        ...data,
        type: "SHIFT_SWAP_RESULT",
        result: "REJECTED",
        title: "Tukar Shift Ditolak",
        body: data.rejectedBy === "TARGET"
          ? "Pegawai tujuan menolak permintaan tukar shift"
          : "Permintaan tukar shift ditolak oleh Kepala Unit",
      }
    case "ATTENDANCE_MISSING_CHECKIN":
      return {
        ...data,
        type: "ATTENDANCE_REMINDER",
        reminderType: "CHECKIN",
        title: "Pengingat: Belum Absen Masuk",
        body: `Anda belum melakukan absen masuk untuk shift ${data.shiftName ?? ""} hari ini`.trim(),
      }
    case "ATTENDANCE_MISSING_CHECKOUT":
      return {
        ...data,
        type: "ATTENDANCE_REMINDER",
        reminderType: "CHECKOUT",
        title: "Pengingat: Belum Absen Pulang",
        body: `Anda belum melakukan absen pulang untuk shift ${data.shiftName ?? ""} hari ini`.trim(),
      }
    case "FACE_ENROLLMENT_APPROVED":
      return {
        ...data,
        type: "face_enrollment_status",
        status: "APPROVED",
        title: "Enrollment Wajah Disetujui",
        body: "Anda sudah bisa absen dengan verifikasi wajah.",
      }
    case "FACE_ENROLLMENT_REJECTED":
      return {
        ...data,
        type: "face_enrollment_status",
        status: "REJECTED",
        title: "Enrollment Wajah Ditolak",
        body: data.reason
          ? `Alasan: ${data.reason}`
          : "Enrollment wajah ditolak. Silakan ulang di bagian kepegawaian.",
      }
  }
}

export async function sendNotification(payload: NotifPayload): Promise<void> {
  const fcmData = buildFcmData(payload.event, payload.data)

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.log(`[FCM-STUB] ${payload.event} → user ${payload.targetUserId}`, fcmData)
    return
  }

  try {
    const tokens = await prisma.fcmToken.findMany({
      where: { userId: payload.targetUserId },
      select: { id: true, token: true },
    })
    if (tokens.length === 0) return

    const firebaseApp = getFirebaseApp()
    if (!firebaseApp) return

    const { getMessaging } = await import("firebase-admin/messaging")
    const messaging = getMessaging(firebaseApp)

    await Promise.all(
      tokens.map(async ({ id, token }) => {
        try {
          await messaging.send({ token, data: fcmData, android: { priority: "high" } })
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            // Token sudah tidak valid — hapus dari DB
            await prisma.fcmToken.delete({ where: { id } }).catch(() => {})
          } else {
            console.error(`[FCM] Gagal kirim ke token ${id}:`, err)
          }
        }
      })
    )
  } catch (err) {
    console.error("[FCM] Gagal kirim notifikasi:", err)
  }
}
