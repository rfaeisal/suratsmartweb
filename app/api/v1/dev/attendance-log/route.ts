import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/dev/require-superadmin"

// Endpoint dev tools — hanya SUPERADMIN.
export async function GET(req: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") ?? "50", 10), 200)

  const records = await prisma.attendance.findMany({
    orderBy: { recordedAt: "desc" },
    take: limit,
    include: {
      employee: { select: { fullName: true, nip: true } },
      room:     { select: { nama: true } },
    },
  })

  return NextResponse.json({
    data: records.map((r) => ({
      id:              r.id,
      fullName:        r.employee.fullName,
      nip:             r.employee.nip,
      eventType:       r.eventType,
      recordedAt:      r.recordedAt.toISOString(),
      tanggalKerja:    r.tanggalKerja.toISOString().slice(0, 10),
      room:            r.room?.nama ?? null,
      status:          r.status,
      telat:           r.telat,
      beaconDetected:  r.beaconDetected,
      flags:           r.flags,
    })),
  })
}
