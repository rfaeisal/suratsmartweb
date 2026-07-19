import { NextRequest, NextResponse } from "next/server"
import { readLocalFile } from "@/lib/storage"
import path from "path"

// Serve avatar dari local storage (on-premise mode).
// Di Vercel Blob mode, avatar langsung diakses via blob URL — endpoint ini tidak dipakai.
export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path")
  if (!filePath) return NextResponse.json({ error: "Path diperlukan" }, { status: 400 })

  // Cegah path traversal
  const storagePath = process.env.FILE_STORAGE_PATH ?? "./uploads"
  const resolved = path.resolve(filePath)
  const base = path.resolve(storagePath)
  if (!resolved.startsWith(base)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 })
  }

  try {
    const buffer = await readLocalFile(resolved)
    const ext = path.extname(resolved).toLowerCase()
    const contentType = ext === ".png" ? "image/png" : "image/jpeg"
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    })
  } catch {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 })
  }
}
