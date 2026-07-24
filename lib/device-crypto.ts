import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto"

const ALGO = "aes-256-gcm"

function getKey(): Buffer {
  const raw = process.env["DEVICE_SECRET_KEY"]
  if (!raw) throw new Error("DEVICE_SECRET_KEY is not set")
  return createHash("sha256").update(raw).digest()
}

// Encrypt a plaintext string. Returns "ivHex:authTagHex:ciphertextHex".
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

// Decrypt a string produced by encryptSecret. Throws if tampered or wrong key.
export function decryptSecret(stored: string): string {
  const key = getKey()
  const parts = stored.split(":")
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format")
  const [ivHex, authTagHex, ciphertextHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const ciphertext = Buffer.from(ciphertextHex, "hex")
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

// Generate a random device_id (12-char hex, 6 bytes).
export function generateDeviceId(): string {
  return randomBytes(6).toString("hex")
}

// Generate a random HMAC secret for a device (32 bytes → 64-char hex).
export function generateDeviceSecret(): string {
  return randomBytes(32).toString("hex")
}
