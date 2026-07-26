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

  const tokens = await prisma.fcmToken.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, deviceId: true },
  })

  if (tokens.length === 0) {
    console.error("❌ Tidak ada FCM token di database")
    process.exit(1)
  }

  console.log(`\n📱 Mengirim ke ${tokens.length} token:`)

  const data = {
    type: "STATUS_CHANGE",
    newStatus: "APPROVED",
    title: "Test Notifikasi CutiSmart",
    body: "FCM push notification berhasil — sistem siap digunakan",
    leaveRequestId: "test-001",
    requestNumber: "TEST/2026/001",
  }

  for (const t of tokens) {
    try {
      const msgId = await getMessaging(app).send({ token: t.token, data })
      console.log(`   ✅ ${t.deviceId.slice(0, 16)}... → ${msgId.slice(-12)}`)
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        console.log(`   ⚠ ${t.deviceId.slice(0, 16)}... → token tidak valid (sudah kedaluwarsa)`)
      } else {
        console.log(`   ❌ ${t.deviceId.slice(0, 16)}... → gagal:`, code ?? err)
      }
    }
  }
  console.log("\n✅ Selesai.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
