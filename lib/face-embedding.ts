/**
 * Helper untuk face recognition embedding.
 *
 * Embedding disimpan sebagai `Bytes` (packed float32 little-endian) supaya
 * padat: 128-dim = 512 byte, 192-dim = 768 byte. Dimensi tergantung model
 * TFLite yang dipilih; `faceEmbeddingModelVersion` di Employee dicatat agar
 * bisa migration bila model diganti.
 *
 * Similarity pakai cosine similarity — range [-1, 1]; 1 = identik.
 * Threshold match dikonfigurasi via AppSetting.
 */

const F32_BYTES = 4

export function packEmbedding(vec: readonly number[] | Float32Array): Buffer {
  const arr = vec instanceof Float32Array ? vec : Float32Array.from(vec)
  const buf = Buffer.allocUnsafe(arr.length * F32_BYTES)
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * F32_BYTES)
  return buf
}

export function unpackEmbedding(bytes: Uint8Array | Buffer): Float32Array {
  if (bytes.byteLength % F32_BYTES !== 0) {
    throw new Error(`face embedding byte length invalid: ${bytes.byteLength}`)
  }
  const out = new Float32Array(bytes.byteLength / F32_BYTES)
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * F32_BYTES)
  return out
}

export function cosineSimilarity(
  a: Float32Array | readonly number[],
  b: Float32Array | readonly number[],
): number {
  if (a.length !== b.length) {
    throw new Error(`embedding dim mismatch: ${a.length} vs ${b.length}`)
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Konstanta untuk enrollment session.
 */
export const FACE_ENROLLMENT = {
  /** TTL token sesi enrollment sejak admin generate (menit). */
  TOKEN_TTL_MINUTES: 5,
  /** Panjang token alphanumeric — di-encode ke QR di admin panel. */
  TOKEN_LENGTH: 8,
  /** Threshold cosine similarity default untuk absen (bisa di-override AppSetting). */
  MATCH_THRESHOLD_DEFAULT: 0.65,
  /** Threshold skor liveness default (bisa di-override AppSetting). */
  LIVENESS_THRESHOLD_DEFAULT: 0.5,
  /** Batasan ukuran thumbnail base64 masuk (setelah decode ~30 KB, longgar) */
  THUMBNAIL_MAX_BYTES: 40 * 1024,
  /** Batasan panjang array embedding — cegah abuse (128–512 dim wajar) */
  EMBEDDING_MIN_DIM: 64,
  EMBEDDING_MAX_DIM: 1024,
} as const

/**
 * Generate token sesi enrollment — alphanumeric case-sensitive.
 * URL-safe, mudah di-encode ke QR di admin panel.
 */
export function generateEnrollmentToken(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // hindari 0/O/1/I
  const bytes = new Uint8Array(FACE_ENROLLMENT.TOKEN_LENGTH)
  // globalThis.crypto ada di Node 20+ (WebCrypto)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}
