import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect, notFound } from "next/navigation"
import { formatStatus, statusColor } from "@/lib/leave-request-utils"
import Link from "next/link"

type Props = { params: Promise<{ id: string }> }

export default async function LeaveRequestDetailPage({ params }: Props) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/login")

  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { nip: true, fullName: true, positionTitle: true, unit: { select: { name: true } } } },
      leaveType: { select: { code: true, name: true } },
      delegate: { select: { fullName: true, positionTitle: true } },
      attachments: { select: { id: true, fileName: true, uploadedAt: true } },
      approvalSteps: {
        include: { approver: { select: { fullName: true, positionTitle: true } } },
        orderBy: { stepOrder: "asc" },
      },
      skDocument: { select: { skNumber: true, generatedAt: true } },
    },
  })

  if (!req) notFound()

  const employeeId = session.user.employeeId
  const isOwner = req.requesterId === employeeId
  const isDelegate = req.delegateId === employeeId
  const isAdmin = session.user.roles.includes("ADMIN_KEPEGAWAIAN") || session.user.roles.includes("SUPERADMIN")
  const isApprover = req.approvalSteps.some((s) => s.approverId === employeeId)

  if (!isOwner && !isDelegate && !isAdmin && !isApprover) redirect("/pegawai/dashboard")

  const stepStatusLabel: Record<string, string> = {
    PENDING: "Menunggu",
    APPROVED: "Disetujui",
    REJECTED: "Ditolak",
    RETURNED: "Dikembalikan",
  }
  const stepStatusColor: Record<string, string> = {
    PENDING: "text-gray-400",
    APPROVED: "text-green-600",
    REJECTED: "text-red-600",
    RETURNED: "text-orange-600",
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/pegawai/dashboard" className="text-sm text-blue-600 hover:underline">
          ← Kembali
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400">{req.requestNumber}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(req.status)}`}>
                {formatStatus(req.status)}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{req.leaveType.name}</h2>
          </div>
          <span className="text-xs text-gray-400">
            {new Date(req.createdAt).toLocaleDateString("id-ID")}
          </span>
        </div>
      </div>

      {/* Detail */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-medium text-gray-900 text-sm mb-3">Detail Pengajuan</h3>
        {[
          { label: "Pegawai", value: `${req.requester.fullName} (${req.requester.nip})` },
          { label: "Unit", value: req.requester.unit?.name ?? "—" },
          {
            label: "Tanggal",
            value: `${new Date(req.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} — ${new Date(req.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
          },
          { label: "Jumlah Hari", value: `${req.totalDays} hari` },
          { label: "Alasan", value: req.reason },
          ...(req.addressDuringLeave
            ? [{ label: "Alamat Selama Cuti", value: req.addressDuringLeave }]
            : []),
          ...(req.emergencyPhone
            ? [{ label: "Kontak Darurat", value: req.emergencyPhone }]
            : []),
          {
            label: "Pegawai Pengganti",
            value: req.delegate
              ? `${req.delegate.fullName}${req.delegate.positionTitle ? ` — ${req.delegate.positionTitle}` : ""}`
              : "—",
          },
          {
            label: "Status Konfirmasi Pengganti",
            value:
              req.delegateConfirmationStatus === "PENDING"
                ? "Menunggu konfirmasi"
                : req.delegateConfirmationStatus === "CONFIRMED"
                ? "Bersedia"
                : `Menolak${req.delegateNote ? ` — "${req.delegateNote}"` : ""}`,
          },
        ].map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-sm">
            <span className="w-40 shrink-0 text-gray-500">{label}</span>
            <span className="text-gray-900">{value}</span>
          </div>
        ))}
      </div>

      {/* Lampiran */}
      {req.attachments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-3">Lampiran</h3>
          <ul className="space-y-1">
            {req.attachments.map((a) => (
              <li key={a.id} className="text-sm text-gray-700">
                {a.fileName}
                <span className="text-xs text-gray-400 ml-2">
                  ({new Date(a.uploadedAt).toLocaleDateString("id-ID")})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Riwayat Approval */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-medium text-gray-900 text-sm mb-4">Riwayat Persetujuan</h3>
        <div className="relative">
          {/* Garis vertikal */}
          <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-100" />

          <div className="space-y-5">
            {/* Langkah 0: Pengajuan dikirim */}
            <div className="flex items-start gap-4 relative">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 z-10">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-medium text-gray-900">Pengajuan Dikirim</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(req.createdAt).toLocaleString("id-ID", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* Langkah 1: Konfirmasi delegasi */}
            {req.delegateId && (
              <div className="flex items-start gap-4 relative">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${
                  req.delegateConfirmationStatus === "CONFIRMED" ? "bg-green-100" :
                  req.delegateConfirmationStatus === "DECLINED" ? "bg-red-100" : "bg-gray-100"
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    req.delegateConfirmationStatus === "CONFIRMED" ? "bg-green-500" :
                    req.delegateConfirmationStatus === "DECLINED" ? "bg-red-500" : "bg-gray-400"
                  }`} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-gray-900">
                    Konfirmasi Pegawai Pengganti
                    {req.delegateConfirmationStatus === "CONFIRMED" && (
                      <span className="ml-2 text-xs font-normal text-green-600">Bersedia</span>
                    )}
                    {req.delegateConfirmationStatus === "DECLINED" && (
                      <span className="ml-2 text-xs font-normal text-red-600">Menolak</span>
                    )}
                    {req.delegateConfirmationStatus === "PENDING" && (
                      <span className="ml-2 text-xs font-normal text-gray-400">Menunggu</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{req.delegate?.fullName}</p>
                  {req.delegateNote && (
                    <p className="text-xs text-gray-400 italic mt-0.5">"{req.delegateNote}"</p>
                  )}
                  {req.delegateDecidedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(req.delegateDecidedAt).toLocaleString("id-ID", {
                        day: "2-digit", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Langkah selanjutnya: tiap ApprovalStep */}
            {req.approvalSteps.map((step) => (
              <div key={step.id} className="flex items-start gap-4 relative">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${
                  step.status === "APPROVED" ? "bg-green-100" :
                  step.status === "REJECTED" ? "bg-red-100" :
                  step.status === "RETURNED" ? "bg-orange-100" : "bg-gray-100"
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    step.status === "APPROVED" ? "bg-green-500" :
                    step.status === "REJECTED" ? "bg-red-500" :
                    step.status === "RETURNED" ? "bg-orange-400" : "bg-gray-400"
                  }`} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-gray-900">
                    {step.approver.fullName}
                    <span className="ml-1 text-xs font-normal text-gray-400">({step.roleLabel})</span>
                    <span className={`ml-2 text-xs font-normal ${stepStatusColor[step.status]}`}>
                      {stepStatusLabel[step.status]}
                    </span>
                  </p>
                  {step.note && (
                    <p className="text-xs text-gray-400 italic mt-0.5">"{step.note}"</p>
                  )}
                  {step.decidedAt ? (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(step.decidedAt).toLocaleString("id-ID", {
                        day: "2-digit", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Menunggu keputusan</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SK */}
      {req.skDocument && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-5">
          <h3 className="font-medium text-green-800 text-sm mb-2">Surat Keputusan Cuti</h3>
          <p className="text-sm text-green-700">
            Nomor SK: <strong>{req.skDocument.skNumber}</strong>
          </p>
          <p className="text-xs text-green-600 mt-1">
            Diterbitkan {new Date(req.skDocument.generatedAt).toLocaleString("id-ID")}
          </p>
        </div>
      )}
    </div>
  )
}
