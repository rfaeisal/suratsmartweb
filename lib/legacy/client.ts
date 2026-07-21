import { createHmac } from "crypto"
import type { EmployeeType } from "@prisma/client"

export interface LegacyEmployee {
  legacyId: string
  nip: string
  fullName: string
  employeeType: EmployeeType
  isActive: boolean
  // Fields berikut tidak digunakan saat sync — dikelola manual di CutiSmart
  unit?: { legacyId: string; name: string }
  positionTitle?: string
  directSupervisorLegacyId?: string
}

export interface SSOValidateResult {
  valid: true
  employee: LegacyEmployee
}
export interface SSOInvalidResult {
  valid: false
  message: string
}
export type SSOResult = SSOValidateResult | SSOInvalidResult

// ── Akun mock untuk development ─────────────────────────────────────────────
const MOCK_ACCOUNTS: Record<string, { password: string; employee: LegacyEmployee }> = {
  superadmin: {
    password: "superadmin123",
    employee: {
      legacyId: "9998",
      nip: "000000000000000001",
      fullName: "Super Administrator",
      employeeType: "PNS",
      unit: { legacyId: "U00", name: "Bagian Kepegawaian" },
      positionTitle: "Admin Kepegawaian",
      directSupervisorLegacyId: undefined,
      isActive: true,
    },
  },
  admin: {
    password: "admin123",
    employee: {
      legacyId: "9999",
      nip: "000000000000000000",
      fullName: "Administrator",
      employeeType: "PNS",
      unit: { legacyId: "U00", name: "Bagian Kepegawaian" },
      positionTitle: "Admin Kepegawaian",
      directSupervisorLegacyId: undefined,
      isActive: true,
    },
  },
}

function mockValidateSSO(username: string, password: string): SSOResult {
  const account = MOCK_ACCOUNTS[username]
  if (!account || account.password !== password) {
    return { valid: false, message: "Username atau password salah" }
  }
  return { valid: true, employee: account.employee }
}

// ── Request ke sistem lama dengan HMAC signature ─────────────────────────────
function buildHeaders(body: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac("sha256", process.env.LEGACY_API_HMAC_SECRET ?? "")
    .update(timestamp + body)
    .digest("hex")
  return {
    "Content-Type": "application/json",
    "X-API-Key": process.env.LEGACY_API_KEY ?? "",
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  }
}

async function legacyFetch<T>(path: string, options?: RequestInit & { body?: string }): Promise<T> {
  const base = process.env.LEGACY_API_BASE_URL ?? ""
  const body = options?.body ?? ""
  const headers = buildHeaders(body)
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  })
  if (!response.ok) {
    throw new Error(`Legacy API error: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

// ── Public API ────────────────────────────────────────────────────────────────

const LOCAL_ACCOUNTS = new Set(["superadmin", "admin"])

export async function validateSSOCredentials(
  username: string,
  password: string,
): Promise<SSOResult> {
  if (process.env.LEGACY_SSO_MOCK === "true" || LOCAL_ACCOUNTS.has(username)) {
    return mockValidateSSO(username, password)
  }
  const body = JSON.stringify({ username, password })
  return legacyFetch<SSOResult>("/sso/validate", { method: "POST", body })
}

export async function getLegacyEmployee(legacyId: string): Promise<LegacyEmployee | null> {
  if (process.env.LEGACY_SSO_MOCK === "true") {
    const account = Object.values(MOCK_ACCOUNTS).find((a) => a.employee.legacyId === legacyId)
    return account?.employee ?? null
  }
  try {
    return await legacyFetch<LegacyEmployee>(`/employees/${legacyId}`)
  } catch {
    return null
  }
}

export async function getAllLegacyEmployees(params?: {
  unitId?: string
  updatedSince?: string
}): Promise<LegacyEmployee[]> {
  if (process.env.LEGACY_SSO_MOCK === "true") {
    const all = Object.values(MOCK_ACCOUNTS).map((a) => a.employee)
    if (params?.unitId) return all.filter((e) => e.unit?.legacyId === params.unitId)
    return all
  }
  const qs = new URLSearchParams()
  if (params?.unitId) qs.set("unitId", params.unitId)
  if (params?.updatedSince) qs.set("updatedSince", params.updatedSince)
  const path = `/employees${qs.toString() ? `?${qs}` : ""}`
  return legacyFetch<LegacyEmployee[]>(path)
}
