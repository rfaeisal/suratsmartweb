import { getAllLegacyEmployees } from "@/lib/legacy/client"
import { syncEmployeeFromLegacy } from "@/lib/auth/sync-employee"

export interface BulkSyncResult {
  total: number
  synced: number
  failed: number
  errors: { legacyId: string; fullName: string; error: string }[]
}

export async function bulkSyncEmployeesFromLegacy(params?: {
  unitId?: string
  updatedSince?: string
}): Promise<BulkSyncResult> {
  const employees = await getAllLegacyEmployees(params)

  const result: BulkSyncResult = { total: employees.length, synced: 0, failed: 0, errors: [] }

  for (const emp of employees) {
    try {
      await syncEmployeeFromLegacy(emp)
      result.synced++
    } catch (err) {
      result.failed++
      result.errors.push({
        legacyId: emp.legacyId,
        fullName: emp.fullName,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  return result
}
