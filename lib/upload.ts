import { writeFile, mkdir, rename, unlink } from "fs/promises"
import path from "path"
import { v4 as uuidv4 } from "uuid"

const STORAGE_PATH = process.env.FILE_STORAGE_PATH ?? "./uploads"
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]
const ALLOWED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"]

// In-memory temp file registry (cukup untuk deployment single-instance on-premise)
const tempRegistry = new Map<string, { fileName: string; filePath: string }>()

export function validateFile(file: File) {
  if (file.size > MAX_SIZE) throw new Error("Ukuran file melebihi batas 5MB")
  const ext = path.extname(file.name).toLowerCase()
  if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Tipe file tidak didukung. Gunakan PDF, JPG, atau PNG")
  }
}

export async function saveTempFile(file: File): Promise<{ tempId: string; fileName: string }> {
  validateFile(file)

  const tempId = uuidv4()
  const ext = path.extname(file.name).toLowerCase() || ".bin"
  const tempDir = path.join(STORAGE_PATH, "temp")

  await mkdir(tempDir, { recursive: true })

  const filePath = path.join(tempDir, `${tempId}${ext}`)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  tempRegistry.set(tempId, { fileName: file.name, filePath })

  // Hapus otomatis setelah 2 jam
  setTimeout(
    () => {
      const info = tempRegistry.get(tempId)
      if (info) {
        tempRegistry.delete(tempId)
        unlink(info.filePath).catch(() => {})
      }
    },
    2 * 60 * 60 * 1000,
  )

  return { tempId, fileName: file.name }
}

export function getTempFile(tempId: string) {
  return tempRegistry.get(tempId) ?? null
}

export async function moveTempToFinal(
  tempId: string,
  originalName: string,
  leaveRequestId: string,
): Promise<string> {
  const info = tempRegistry.get(tempId)
  if (!info) throw new Error(`File sementara tidak ditemukan: ${tempId}`)

  const ext = path.extname(originalName).toLowerCase() || path.extname(info.filePath)
  const finalDir = path.join(STORAGE_PATH, "attachments", leaveRequestId)
  await mkdir(finalDir, { recursive: true })

  const finalPath = path.join(finalDir, `${tempId}${ext}`)
  await rename(info.filePath, finalPath)
  tempRegistry.delete(tempId)

  return finalPath
}

export async function saveDirectFile(file: File, leaveRequestId: string): Promise<string> {
  validateFile(file)

  const fileId = uuidv4()
  const ext = path.extname(file.name).toLowerCase() || ".bin"
  const finalDir = path.join(STORAGE_PATH, "attachments", leaveRequestId)
  await mkdir(finalDir, { recursive: true })

  const filePath = path.join(finalDir, `${fileId}${ext}`)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  return filePath
}
