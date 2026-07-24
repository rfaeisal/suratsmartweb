import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

export async function GET(req: NextRequest) {
  let authUser
  try {
    authUser = await requireAuth(req, ["PEGAWAI"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const attendances = await prisma.attendance.findMany({
    where: {
      employeeId: authUser.employeeId,
      ...(from || to
        ? {
            tanggalKerja: {
              ...(from ? { gte: new Date(from + "T00:00:00.000Z") } : {}),
              ...(to ? { lte: new Date(to + "T00:00:00.000Z") } : {}),
            },
          }
        : {}),
    },
    orderBy: { recordedAt: "desc" },
    take: 100,
  })

  return NextResponse.json({
    data: attendances.map((a) => ({
      attendance_id: a.id,
      event_type: a.eventType,
      recorded_at: a.recordedAt,
      tanggal_kerja: a.tanggalKerja,
      status: a.status,
      telat: a.telat,
      flags: a.flags,
    })),
  })
}
