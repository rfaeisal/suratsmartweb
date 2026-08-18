import { NextResponse } from "next/server"

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "QUOTA_EXCEEDED"
  | "INVALID_APPROVAL_STATE"
  | "INTEGRATION_ERROR"
  | "SESSION_ALREADY_ACTIVE"
  | "SESSION_REVOKED"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR"
  | "DEVICE_CONFLICT"
  | "DEVICE_BINDING_REQUIRED"
  | "BEACON_TIDAK_TERDETEKSI"
  | "QR_INVALID"
  | "QR_EXPIRED"
  | "QR_REPLAYED"
  | "NO_ROSTER"
  | "EMPLOYEE_INACTIVE"

interface ApiError {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

export function apiError(
  code: ErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): NextResponse {
  const body: { error: ApiError } = { error: { code, message, ...(details ? { details } : {}) } }
  return NextResponse.json(body, { status })
}

export const Errors = {
  unauthorized: (message = "Token tidak valid atau sesi telah berakhir") =>
    apiError("UNAUTHORIZED", message, 401),

  sessionRevoked: () =>
    apiError("SESSION_REVOKED", "Sesi telah dicabut. Silakan login ulang.", 401),

  forbidden: (message = "Anda tidak memiliki akses ke resource ini") =>
    apiError("FORBIDDEN", message, 403),

  notFound: (resource = "Resource") => apiError("NOT_FOUND", `${resource} tidak ditemukan`, 404),

  validation: (message: string, details?: Record<string, unknown>) =>
    apiError("VALIDATION_ERROR", message, 422, details),

  conflict: (message: string) => apiError("CONFLICT", message, 409),

  sessionAlreadyActive: (deviceLabel?: string, loggedInSince?: Date) =>
    apiError("SESSION_ALREADY_ACTIVE", "Akun sedang login di device lain", 409, {
      deviceLabel,
      loggedInSince,
    }),

  invalidApprovalState: (message: string) =>
    apiError("INVALID_APPROVAL_STATE", message, 422),

  tooManyRequests: (message = "Terlalu banyak percobaan. Coba lagi nanti.") =>
    apiError("TOO_MANY_REQUESTS", message, 429),

  deviceConflict: (deviceLabel?: string) =>
    apiError("DEVICE_CONFLICT", "Akun sedang terikat ke perangkat lain. Hubungi admin untuk reset.", 409, {
      deviceLabel,
    }),

  deviceBindingRequired: () =>
    apiError("DEVICE_BINDING_REQUIRED", "device_id wajib diisi untuk pegawai", 403),

  beaconTidakTerdeteksi: () =>
    apiError(
      "BEACON_TIDAK_TERDETEKSI",
      "Beacon tidak terdeteksi. Aktifkan Bluetooth dan pastikan berada di lingkungan RS.",
      422,
    ),

  qrInvalid: () =>
    apiError("QR_INVALID", "Token QR tidak valid atau perangkat tidak dikenal", 422),

  qrExpired: () =>
    apiError("QR_EXPIRED", "Token QR sudah kedaluwarsa. Scan ulang QR terbaru.", 422),

  qrReplayed: () =>
    apiError("QR_REPLAYED", "Token QR sudah pernah digunakan", 422),

  noRoster: () =>
    apiError("NO_ROSTER", "Tidak ada jadwal kerja untuk tanggal ini", 422),

  employeeInactive: () =>
    apiError(
      "EMPLOYEE_INACTIVE",
      "Akun pegawai berstatus non-aktif. Hubungi bagian kepegawaian.",
      403,
    ),

  internal: (message = "Terjadi kesalahan internal server") =>
    apiError("INTERNAL_ERROR", message, 500),
}
