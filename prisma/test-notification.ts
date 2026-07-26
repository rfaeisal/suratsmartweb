/**
 * Script test: kirim FCM notification langsung ke token terbaru di DB.
 * Jalankan di container: node_modules/.bin/tsx prisma/test-notification.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { initializeApp, getApps, cert, type App } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON tidak diset")
    process.exit(1)
  }

  const existing = getApps()
  const app: App = existing.length > 0
    ? existing[0]
    : initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) })

  const latest = await prisma.fcmToken.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, deviceId: true },
  })

  if (!latest) {
    console.error("❌ Tidak ada FCM token di database")
    process.exit(1)
  }

  console.log(`\n📱 Mengirim ke device: ${latest.deviceId}`)
  console.log(`   Token: ${latest.token.slice(0, 30)}...`)

  try {
    const msgId = await getMessaging(app).send({
      token: latest.token,
      data: {
        type: "STATUS_CHANGE",
        newStatus: "APPROVED",
        title: "Test Notifikasi CutiSmart",
        body: "FCM push notification berhasil — sistem siap digunakan",
        leaveRequestId: "test-001",
        requestNumber: "TEST/2026/001",
      },
    })
    console.log(`\n✅ Notifikasi berhasil terkirim!`)
    console.log(`   Message ID: ${msgId}`)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      console.error("❌ Token tidak valid atau sudah kedaluwarsa di Firebase")
      console.error("   Minta tim mobile login ulang untuk memperbarui token")
    } else {
      console.error("❌ Gagal kirim:", err)
    }
    process.exit(1)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
