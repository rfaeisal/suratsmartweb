import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { getAllLegacyEmployees } from "@/lib/legacy/client"
import { syncEmployeeFromLegacy } from "@/lib/auth/sync-employee"
import { writeAuditLog } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

async function requireAdmin(req: NextRequest) {
  const session = await auth()
  if (!session?.user) throw new Error("UNAUTHORIZED")
  if (!session.user.roles.includes("ADMIN_KEPEGAWAIAN") && !session.user.roles.includes("SUPERADMIN")) {
    throw new Error("FORBIDDEN")
  }
  return session
}

// GET — preview: pegawai dari legacy yang NIP-nya belum ada di DB
export async function GET(req: NextRequest) {
  let session
  try { session = await requireAdmin(req) } catch (e) {
    return (e as Error).message === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized()
  }
  void session

  const unitId = req.nextUrl.searchParams.get("unitId") ?? undefined

  let legacyEmployees
  try {
    legacyEmployees = await getAllLegacyEmployees({ unitId })
  } catch (err) {
    return Errors.internal(err instanceof Error ? err.message : "Gagal menghubungi sistem lama")
  }

  const existingNips = await prisma.employee.findMany({ select: { nip: true } })
  const nipSet = new Set(existingNips.map((e) => e.nip))

  const newEmployees = legacyEmployees.filter((e) => !nipSet.has(e.nip))

  return NextResponse.json({
    totalFromLegacy: legacyEmployees.length,
    newCount: newEmployees.length,
    employees: newEmployees.map(({ legacyId, nip, fullName }) => ({ legacyId, nip, fullName })),
  })
}

// POST — import pegawai terpilih berdasarkan legacyId
const importSchema = z.object({
  legacyIds: z.array(z.string()).min(1),
})

export async function POST(req: NextRequest) {
  let session
  try { session = await requireAdmin(req) } catch (e) {
    return (e as Error).message === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized()
  }

  let body: unknown = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = importSchema.safeParse(body)
  if (!parsed.success) return Errors.validation("Format parameter tidak valid")

  // Ambil data pegawai dari legacy berdasarkan legacyId yang dipilih
  let allLegacy
  try {
    allLegacy = await getAllLegacyEmployees()
  } catch (err) {
    return Errors.internal(err instanceof Error ? err.message : "Gagal menghubungi sistem lama")
  }

  const selected = allLegacy.filter((e) => parsed.data.legacyIds.includes(e.legacyId))

  // Cek NIP — skip jika sudah ada di DB
  const existingNips = await prisma.employee.findMany({ select: { nip: true } })
  const nipSet = new Set(existingNips.map((e) => e.nip))

  const result = { total: selected.length, imported: 0, skipped: 0, failed: 0, errors: [] as { legacyId: string; fullName: string; error: string }[] }

  for (const emp of selected) {
    if (nipSet.has(emp.nip)) {
      result.skipped++
      continue
    }
    try {
      await syncEmployeeFromLegacy(emp)
      result.imported++
    } catch (err) {
      result.failed++
      result.errors.push({
        legacyId: emp.legacyId,
        fullName: emp.fullName,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "IMPORT_NEW_EMPLOYEES",
    entityType: "Employee",
    entityId: "bulk",
    metadata: { legacyIds: parsed.data.legacyIds, result } as unknown as import("@prisma/client").Prisma.InputJsonValue,
  })

  return NextResponse.json(result, { status: result.failed > 0 ? 207 : 200 })
}

