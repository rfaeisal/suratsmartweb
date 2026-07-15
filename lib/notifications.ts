import { prisma } from "@/lib/prisma"

export type NotifEvent =
  | "DELEGATE_REQUESTED"     // ke calon pengganti: ada yang menunjuk kamu sebagai delegasi
  | "DELEGATE_DECLINED"      // ke pegawai pengaju: pengganti menolak
  | "APPROVAL_REQUESTED"     // ke approver: ada pengajuan menunggu persetujuanmu
  | "REQUEST_APPROVED"       // ke pegawai: pengajuan disetujui, SK terbit
  | "REQUEST_REJECTED"       // ke pegawai: pengajuan ditolak
  | "REQUEST_RETURNED"       // ke pegawai: pengajuan dikembalikan untuk revisi
  | "SEND_TO_LEGACY_FAILED"  // ke admin: pengiriman ke sistem lama gagal

interface NotifPayload {
  event: NotifEvent
  targetUserId: string
  data: Record<string, string>
}

export async function sendNotification(payload: NotifPayload): Promise<void> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // FCM belum dikonfigurasi — log saja untuk development
    console.log(`[FCM-STUB] ${payload.event} → user ${payload.targetUserId}`, payload.data)
    return
  }

  try {
    const tokens = await prisma.fcmToken.findMany({
      where: { userId: payload.targetUserId },
      select: { token: true },
    })
    if (tokens.length === 0) return

    // TODO: integrasi firebase-admin SDK saat FIREBASE_SERVICE_ACCOUNT_JSON tersedia
    console.log(`[FCM] ${payload.event} → ${tokens.length} token(s) for user ${payload.targetUserId}`)
  } catch (err) {
    console.error("[FCM] Gagal kirim notifikasi:", err)
  }
}
