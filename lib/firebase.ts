import { initializeApp, getApps, cert, type App } from "firebase-admin/app"

let app: App | null = null

export function getFirebaseApp(): App | null {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null
  if (app) return app
  try {
    const existing = getApps()
    if (existing.length > 0) {
      app = existing[0]
      return app
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    app = initializeApp({ credential: cert(serviceAccount) })
    return app
  } catch (err) {
    console.error("[Firebase] Gagal inisialisasi:", err)
    return null
  }
}
