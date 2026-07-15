import { createHmac } from "crypto"
import type { EmployeeType } from "@prisma/client"

export interface LegacyEmployee {
  legacyId: string
  nip: string
  fullName: string
  employeeType: EmployeeType
  unit: { legacyId: string; name: string }
  positionTitle?: string
  directSupervisorLegacyId?: string
  isActive: boolean
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
  "pegawai1": {
    password: "pegawai123",
    employee: {
      legacyId: "1001",
      nip: "198501012010011001",
      fullName: "Budi Santoso",
      employeeType: "PNS",
      unit: { legacyId: "U01", name: "Bagian Umum" },
      positionTitle: "Staf",
      directSupervisorLegacyId: "2001",
      isActive: true,
    },
  },
  "atasan1": {
    password: "atasan123",
    employee: {
      legacyId: "2001",
      nip: "197501012000011001",
      fullName: "Siti Rahayu",
      employeeType: "PNS",
      unit: { legacyId: "U01", name: "Bagian Umum" },
      positionTitle: "Kepala Sub-Bagian",
      directSupervisorLegacyId: "3001",
      isActive: true,
    },
  },
  "pppk1": {
    password: "pppk123",
    employee: {
      legacyId: "1002",
      nip: "199001022021211001",
      fullName: "Dian Pratiwi",
      employeeType: "PPPK",
      unit: { legacyId: "U01", name: "Bagian Umum" },
      positionTitle: "Staf",
      directSupervisorLegacyId: "2001",
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

export async function validateSSOCredentials(
  username: string,
  password: string,
): Promise<SSOResult> {
  if (process.env.LEGACY_SSO_MOCK === "true") {
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
