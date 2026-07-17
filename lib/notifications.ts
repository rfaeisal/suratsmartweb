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
          await messaging.send({ token, data: fcmData })
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
