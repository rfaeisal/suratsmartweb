import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { bulkSyncEmployeesFromLegacy } from "@/lib/auth/bulk-sync-employees"
import { writeAuditLog } from "@/lib/audit"
import { Errors } from "@/lib/errors"

const syncSchema = z.object({
  unitId: z.string().optional(),
  updatedSince: z.string().datetime({ offset: true }).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Errors.unauthorized()
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    return Errors.forbidden()
  }

  let body: unknown = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Format parameter tidak valid")

  let result
  try {
    result = await bulkSyncEmployeesFromLegacy(parsed.data)
  } catch (err) {
    return Errors.internal(err instanceof Error ? err.message : "Gagal menghubungi sistem lama")
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "BULK_SYNC_EMPLOYEES",
    entityType: "Employee",
    entityId: "bulk",
    metadata: { params: parsed.data, result } as unknown as import("@prisma/client").Prisma.InputJsonValue,
  })

  return NextResponse.json(result, { status: result.failed > 0 ? 207 : 200 })
}
