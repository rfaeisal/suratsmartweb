import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/require-auth"
import { AuthError } from "@/lib/auth/require-auth"
import { Errors } from "@/lib/errors"
import fs from "node:fs/promises"
import path from "node:path"

const STORAGE_PATH = path.resolve(process.env.FILE_STORAGE_PATH ?? "./uploads")

type Props = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const user = await requireAuth(req)
    const { id } = await params

    const skDoc = await prisma.skDocument.findUnique({
      where: { leaveRequestId: id },
      include: {
        leaveRequest: {
          select: {
            requestNumber: true,
            requesterId: true,
            approvalSteps: { select: { approverId: true } },
          },
        },
      },
    })
    if (!skDoc) return Errors.notFound("SK belum digenerate")

    // Akses: pemilik, admin, atau salah satu approver
    const isAdmin = user.roles.includes("ADMIN_KEPEGAWAIAN") || user.roles.includes("SUPERADMIN")
    const isOwner = skDoc.leaveRequest.requesterId === user.employeeId
    const isApprover = skDoc.leaveRequest.approvalSteps.some((s) => s.approverId === user.employeeId)
    if (!isAdmin && !isOwner && !isApprover) return Errors.forbidden()

    // Cegah path traversal — pastikan file berada di dalam STORAGE_PATH
    const resolvedPath = path.resolve(skDoc.filePath)
    if (!resolvedPath.startsWith(STORAGE_PATH)) {
      return Errors.forbidden()
    }

    const buffer = await fs.readFile(resolvedPath)

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="SK-${skDoc.leaveRequest.requestNumber}.pdf"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    if (err instanceof AuthError)
      return Errors[
        err.code === "FORBIDDEN" ? "forbidden" : err.code === "SESSION_REVOKED" ? "sessionRevoked" : "unauthorized"
      ]()
    return Errors.internal()
  }
}
