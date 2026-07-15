import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface AuditParams {
  actorId?: string
  action: string
  entityType: string
  entityId: string
  metadata?: Prisma.InputJsonValue
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({ data: params })
  } catch (err) {
    // Audit log gagal tidak boleh menggagalkan operasi utama
    console.error("[AuditLog] Gagal menulis audit log:", err)
  }
}
