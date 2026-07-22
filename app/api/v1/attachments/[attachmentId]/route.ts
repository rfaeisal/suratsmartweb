import { NextRequest, NextResponse } from "next/server"
import path from "node:path"
import { requireAuth, AuthError } from "@/lib/auth/require-auth"
import { prisma } from "@/lib/prisma"
import { Errors } from "@/lib/errors"
import { isRemoteUrl, readLocalFile } from "@/lib/storage"

const STORAGE_PATH = path.resolve(process.env.FILE_STORAGE_PATH ?? "./uploads")

const CONTENT_TYPES: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
}

type Props = { params: Promise<{ attachmentId: string }> }

export async function GET(req: NextRequest, { params }: Props) {
  let user
  try {
    user = await requireAuth(req)
  } catch (err) {
    if (err instanceof AuthError) {
      return err.code === "SESSION_REVOKED" ? Errors.sessionRevoked() : Errors.unauthorized(err.message)
    }
    return Errors.internal()
  }

  const { attachmentId } = await params

  const attachment = await prisma.leaveAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      leaveRequest: {
        select: {
          requesterId: true,
          delegateId: true,
          approvalSteps: { select: { approverId: true } },
        },
      },
    },
  })

  if (!attachment) return Errors.notFound("Lampiran")

  const { leaveRequest } = attachment
  const isAdmin    = user.roles.includes("ADMIN_KEPEGAWAIAN") || user.roles.includes("SUPERADMIN")
  const isOwner    = leaveRequest.requesterId === user.employeeId
  const isDelegate = leaveRequest.delegateId  === user.employeeId
  const isApprover = leaveRequest.approvalSteps.some((s) => s.approverId === user.employeeId)

  if (!isAdmin && !isOwner && !isDelegate && !isApprover) {
    return Errors.forbidden()
  }

  const ext = path.extname(attachment.fileName).toLowerCase()
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream"
  const disposition = `inline; filename="${attachment.fileName}"`

  // Blob storage: fetch dan pipe ke client
  if (isRemoteUrl(attachment.filePath)) {
    const blobRes = await fetch(attachment.filePath)
    if (!blobRes.ok) return Errors.notFound("File lampiran tidak ditemukan di storage")
    const buffer = await blobRes.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "private, no-store",
      },
    })
  }

  // Local storage: baca dari filesystem, cegah path traversal
  const resolvedPath = path.resolve(attachment.filePath)
  if (!resolvedPath.startsWith(STORAGE_PATH)) return Errors.forbidden()

  try {
    const buffer = await readLocalFile(resolvedPath)
    return new NextResponse(buffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return Errors.notFound("File lampiran tidak ditemukan di server")
  }
}
