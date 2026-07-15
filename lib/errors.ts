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
    apiError("TOO_MANY_REQUESTS" as ErrorCode, message, 429),

  internal: (message = "Terjadi kesalahan internal server") =>
    apiError("INTERNAL_ERROR", message, 500),
}
