import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"

const patchSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  kode: z.string().min(1).max(20).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req, ["SUPERADMIN", "ADMIN_KEPEGAWAIAN"])
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return e.code === "FORBIDDEN" ? Errors.forbidden() : Errors.unauthorized(e.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const room = await prisma.room.findUnique({ where: { id } })
  if (!room) return Errors.notFound("Ruangan")

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return Errors.validation(parsed.error.issues[0].message)

  if (parsed.data.kode && parsed.data.kode !== room.kode) {
    const conflict = await prisma.room.findUnique({ where: { kode: parsed.data.kode } })
    if (conflict) return Errors.conflict("Kode ruangan sudah dipakai")
  }

  const updated = await prisma.room.update({
    where: { id },
    data: {
      ...(parsed.data.nama !== undefined && { nama: parsed.data.nama }),
      ...(parsed.data.kode !== undefined && { kode: parsed.data.kode }),
    },
  })

  return NextResponse.json({ id: updated.id, nama: updated.nama, kode: updated.kode })
}
