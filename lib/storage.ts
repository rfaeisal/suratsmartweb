import path from "path"
import { v4 as uuidv4 } from "uuid"

const STORAGE_PATH = process.env.FILE_STORAGE_PATH ?? "./uploads"
const MAX_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"]
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]

const IS_BLOB = process.env.STORAGE_PROVIDER === "vercel-blob"

// In-memory temp registry — only used in local mode (single-instance on-premise)
const tempRegistry = new Map<string, { fileName: string; filePath: string }>()

export function validateFile(file: File) {
  if (file.size > MAX_SIZE) throw new Error("Ukuran file melebihi batas 2MB")
  const ext = path.extname(file.name).toLowerCase()
  if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Tipe file tidak didukung. Gunakan PDF, JPG, atau PNG")
  }
}

// ── Temp upload (step 1 of 2-step attach flow) ───────────────────────────────

export async function saveTempFile(file: File): Promise<{ tempId: string; fileName: string }> {
  validateFile(file)
  const ext = path.extname(file.name).toLowerCase() || ".bin"

  if (IS_BLOB) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`temp/${uuidv4()}${ext}`, file, {
      access: "public",
      addRandomSuffix: false,
    })
    // Encode fileName into tempId so no in-memory state is needed across invocations
    return { tempId: `${blob.url}|${file.name}`, fileName: file.name }
  }

  // ── local ─────────────────────────────────────────────────────────────────
  const { writeFile, mkdir } = await import("fs/promises")
  const tempId = uuidv4()
  const tempDir = path.join(STORAGE_PATH, "temp")
  await mkdir(tempDir, { recursive: true })
  const filePath = path.join(tempDir, `${tempId}${ext}`)
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()))
  tempRegistry.set(tempId, { fileName: file.name, filePath })

  setTimeout(() => {
    const info = tempRegistry.get(tempId)
    if (info) {
      tempRegistry.delete(tempId)
      import("fs/promises").then(({ unlink }) => unlink(info.filePath).catch(() => {}))
    }
  }, 2 * 60 * 60 * 1000)

  return { tempId, fileName: file.name }
}

export function getTempFile(tempId: string): { fileName: string; filePath: string } | null {
  if (IS_BLOB) {
    // tempId = "${blobUrl}|${fileName}"
    const sep = tempId.indexOf("|")
    if (sep === -1) return null
    return { filePath: tempId.slice(0, sep), fileName: tempId.slice(sep + 1) }
  }
  return tempRegistry.get(tempId) ?? null
}

// ── Move temp → final location ───────────────────────────────────────────────

export async function moveTempToFinal(
  tempId: string,
  originalName: string,
  leaveRequestId: string,
): Promise<string> {
  const info = getTempFile(tempId)
  if (!info) throw new Error(`File sementara tidak ditemukan: ${tempId}`)
  const ext = path.extname(originalName).toLowerCase() || path.extname(info.filePath)

  if (IS_BLOB) {
    const { copy, del } = await import("@vercel/blob")
    const finalKey = `attachments/${leaveRequestId}/${uuidv4()}${ext}`
    const { url } = await copy(info.filePath, finalKey, { access: "public" })
    await del(info.filePath)
    return url
  }

  // ── local ─────────────────────────────────────────────────────────────────
  const { rename, mkdir } = await import("fs/promises")
  const finalDir = path.join(STORAGE_PATH, "attachments", leaveRequestId)
  await mkdir(finalDir, { recursive: true })
  const finalPath = path.join(finalDir, `${uuidv4()}${ext}`)
  await rename(info.filePath, finalPath)
  tempRegistry.delete(tempId)
  return finalPath
}

// ── Save SK PDF ──────────────────────────────────────────────────────────────

export async function savePdf(buffer: Buffer, fileName: string): Promise<string> {
  if (IS_BLOB) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`sk/${fileName}`, buffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: false,
    })
    return blob.url
  }

  // ── local ─────────────────────────────────────────────────────────────────
  const { writeFile, mkdir } = await import("fs/promises")
  const storageDir = path.join(STORAGE_PATH, "sk")
  await mkdir(storageDir, { recursive: true })
  const filePath = path.join(storageDir, fileName)
  await writeFile(filePath, buffer)
  return filePath
}

// ── Read file for download ───────────────────────────────────────────────────

export function isRemoteUrl(fileKey: string): boolean {
  return fileKey.startsWith("http://") || fileKey.startsWith("https://")
}

export async function readLocalFile(filePath: string): Promise<Buffer> {
  const { readFile } = await import("fs/promises")
  return readFile(filePath)
}
