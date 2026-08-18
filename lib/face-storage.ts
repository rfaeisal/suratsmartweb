/**
 * Storage helper untuk face thumbnail — 160x160 JPEG (~15 KB).
 * PRIVATE by default — akses lewat endpoint dengan role check + audit log.
 *
 * Path skema:
 *   - Local  : {FILE_STORAGE_PATH}/face-thumbnails/{employeeId}.jpg
 *   - Blob   : face-thumbnails/{employeeId}.jpg
 *
 * Nilai yang disimpan di `Employee.faceThumbnailUrl`:
 *   - Local  : absolute filesystem path (di-consume oleh readFaceThumbnail)
 *   - Blob   : URL blob (di-consume via fetch)
 */
import path from "path"

const STORAGE_PATH = process.env.FILE_STORAGE_PATH ?? "./uploads"
const IS_BLOB = process.env.STORAGE_PROVIDER === "vercel-blob"
const MAX_BYTES = 60 * 1024 // 60 KB — thumbnail 160x160 q70 ~15 KB, longgar

export async function saveFaceThumbnail(
  employeeId: string,
  jpegBytes: Buffer,
): Promise<string> {
  if (jpegBytes.byteLength > MAX_BYTES) {
    throw new Error(`Ukuran thumbnail melebihi batas (${jpegBytes.byteLength} > ${MAX_BYTES})`)
  }
  // Cek magic bytes JPEG (FF D8 FF)
  if (
    jpegBytes.byteLength < 3 ||
    jpegBytes[0] !== 0xff ||
    jpegBytes[1] !== 0xd8 ||
    jpegBytes[2] !== 0xff
  ) {
    throw new Error("Thumbnail harus berformat JPEG")
  }

  if (IS_BLOB) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`face-thumbnails/${employeeId}.jpg`, jpegBytes, {
      access: "public", // tetap perlu endpoint proxy untuk enforce role check
      contentType: "image/jpeg",
      addRandomSuffix: false,
    })
    return blob.url
  }

  const { writeFile, mkdir } = await import("fs/promises")
  const dir = path.join(STORAGE_PATH, "face-thumbnails")
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${employeeId}.jpg`)
  await writeFile(filePath, jpegBytes)
  return filePath
}

export async function deleteFaceThumbnail(thumbnailUrl: string | null | undefined) {
  if (!thumbnailUrl) return
  if (IS_BLOB) {
    const { del } = await import("@vercel/blob")
    await del(thumbnailUrl).catch(() => {})
    return
  }
  const { unlink } = await import("fs/promises")
  await unlink(thumbnailUrl).catch(() => {})
}

export async function readFaceThumbnail(thumbnailUrl: string): Promise<Buffer> {
  if (IS_BLOB || thumbnailUrl.startsWith("http://") || thumbnailUrl.startsWith("https://")) {
    const res = await fetch(thumbnailUrl)
    if (!res.ok) throw new Error(`Thumbnail fetch failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  const { readFile } = await import("fs/promises")
  return readFile(thumbnailUrl)
}
