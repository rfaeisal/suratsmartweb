import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  kepalaRuanganId: z.string().nullable().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "FORBIDDEN") return Errors.forbidden()
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { id } = await params
  const unit = await prisma.workUnit.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      kepalaRuangan: { select: { id: true, fullName: true, positionTitle: true } },
      children: { select: { id: true, name: true, _count: { select: { employees: true } } }, orderBy: { name: "asc" } },
      employees: {
        include: { position: { select: { name: true, level: true } } },
        orderBy: { fullName: "asc" },
      },
    },
  })
  if (!unit) return Errors.notFound("Unit kerja")
  return NextResponse.json(unit)
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "FORBIDDEN") return Errors.forbidden()
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Errors.validation("Request body tidak valid")
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return Errors.validation("Data tidak valid", parsed.error.flatten().fieldErrors)
  }

  const existing = await prisma.workUnit.findUnique({ where: { id } })
  if (!existing) return Errors.notFound("Unit kerja")

  if (parsed.data.parentId === id) {
    return Errors.validation("Unit kerja tidak bisa menjadi parent dari dirinya sendiri")
  }

  if (parsed.data.parentId) {
    const parent = await prisma.workUnit.findUnique({ where: { id: parsed.data.parentId } })
    if (!parent) return Errors.notFound("Unit kerja induk")
  }

  if (parsed.data.kepalaRuanganId) {
    const kepala = await prisma.employee.findUnique({ where: { id: parsed.data.kepalaRuanganId } })
    if (!kepala || !kepala.isActive) return Errors.validation("Kepala ruangan tidak ditemukan atau tidak aktif")
  }

  const updated = await prisma.workUnit.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
      ...(parsed.data.kepalaRuanganId !== undefined ? { kepalaRuanganId: parsed.data.kepalaRuanganId } : {}),
    },
    include: {
      parent: { select: { id: true, name: true } },
      kepalaRuangan: { select: { id: true, fullName: true, positionTitle: true } },
      _count: { select: { employees: true } },
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(req, ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"])
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "FORBIDDEN") return Errors.forbidden()
      if (err.code === "SESSION_REVOKED") return Errors.sessionRevoked()
      return Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { id } = await params

  const unit = await prisma.workUnit.findUnique({
    where: { id },
    include: { _count: { select: { employees: true, children: true } } },
  })
  if (!unit) return Errors.notFound("Unit kerja")

  if (unit._count.employees > 0)
    return Errors.validation(`Unit masih memiliki ${unit._count.employees} pegawai. Pindahkan pegawai terlebih dahulu.`)
  if (unit._count.children > 0)
    return Errors.validation("Unit masih memiliki sub-unit. Hapus sub-unit terlebih dahulu.")

  await prisma.workUnit.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
