import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { formatStatus, statusColor } from "@/lib/leave-request-utils"
import SetApprovalFlowForm from "./SetApprovalFlowForm"
import SkActions from "./SkActions"

type Props = { params: Promise<{ id: string }> }

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
  RETURNED: "text-orange-500",
}

export default async function AdminLeaveRequestDetailPage({ params }: Props) {
  const { id } = await params

  const [req, employees] = await Promise.all([
    prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            fullName: true,
            nip: true,
            positionTitle: true,
            employeeType: true,
            unit: { select: { name: true } },
          },
        },
        leaveType: { select: { code: true, name: true } },
        delegate: { select: { fullName: true, positionTitle: true } },
        attachments: { select: { id: true, fileName: true, uploadedAt: true } },
        approvalSteps: {
          include: { approver: { select: { fullName: true, positionTitle: true, nip: true } } },
          orderBy: { stepOrder: "asc" },
        },
        skDocument: { select: { skNumber: true, filePath: true, generatedAt: true } },
        integrationLogs: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, positionTitle: true, unit: { select: { name: true } } },
      orderBy: [{ unit: { name: "asc" } }, { fullName: "asc" }],
    }),
  ])

  if (!req) notFound()

  const canSetFlow =
    req.status === "PENDING_ADMIN_REVIEW" && req.delegateConfirmationStatus === "CONFIRMED"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/admin/leave-requests" className="text-sm text-blue-600 hover:underline">
          ← Pengajuan Cuti
        </Link>
      </div>

      {/* Header card */}
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
          <span className="text-xs text-gray-400 shrink-0">
            {new Date(req.createdAt).toLocaleDateString("id-ID")}
          </span>
        </div>
      </div>

      {/* Detail pengajuan */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-medium text-gray-900 text-sm">Detail Pengajuan</h3>
        {[
          {
            label: "Pegawai",
            value: `${req.requester.fullName} (${req.requester.nip}) — ${req.requester.employeeType}`,
          },
          { label: "Unit", value: req.requester.unit.name },
          { label: "Jabatan", value: req.requester.positionTitle ?? "—" },
          {
            label: "Tanggal",
            value: `${new Date(req.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} — ${new Date(req.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} (${req.totalDays} hari)`,
          },
          { label: "Alasan", value: req.reason },
          {
            label: "Pegawai Pengganti",
            value: req.delegate
              ? `${req.delegate.fullName}${req.delegate.positionTitle ? ` — ${req.delegate.positionTitle}` : ""}`
              : "—",
          },
          {
            label: "Status Delegasi",
            value:
              req.delegateConfirmationStatus === "PENDING"
                ? "Menunggu konfirmasi"
                : req.delegateConfirmationStatus === "CONFIRMED"
                ? "Bersedia (CONFIRMED)"
                : `Menolak${req.delegateNote ? ` — "${req.delegateNote}"` : ""}`,
          },
        ].map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-sm">
            <span className="w-44 shrink-0 text-gray-500">{label}</span>
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

      {/* Alur Approval */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-medium text-gray-900 text-sm mb-4">Alur Persetujuan</h3>

        {req.approvalSteps.length > 0 ? (
          <div className="space-y-3 mb-5">
            {req.approvalSteps.map((step) => (
              <div key={step.id} className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                    step.status === "APPROVED"
                      ? "bg-green-100 text-green-700"
                      : step.status === "REJECTED"
                      ? "bg-red-100 text-red-700"
                      : step.status === "RETURNED"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {step.stepOrder}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{step.approver.fullName}</span>
                    <span className="text-xs text-gray-400">{step.roleLabel}</span>
                    <span className={`text-xs font-medium ${stepStatusColor[step.status]}`}>
                      {stepStatusLabel[step.status]}
                    </span>
                  </div>
                  {step.note && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">"{step.note}"</p>
                  )}
                  {step.decidedAt && (
                    <p className="text-xs text-gray-400">{new Date(step.decidedAt).toLocaleString("id-ID")}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4">Belum ada alur approval ditetapkan.</p>
        )}

        {/* Form set approval flow */}
        {canSetFlow && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-700 mb-3">
              Tetapkan Alur Approval
              {req.approvalSteps.length > 0 && (
                <span className="ml-2 text-amber-600">(akan menggantikan alur sebelumnya)</span>
              )}
            </p>
            <SetApprovalFlowForm leaveRequestId={id} employees={employees} />
          </div>
        )}

        {req.status === "PENDING_ADMIN_REVIEW" && req.delegateConfirmationStatus !== "CONFIRMED" && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
            Alur approval belum dapat ditetapkan karena konfirmasi pegawai pengganti masih{" "}
            <strong>
              {req.delegateConfirmationStatus === "PENDING" ? "menunggu" : "ditolak"}
            </strong>
            .
          </div>
        )}
      </div>

      {/* SK & Integrasi */}
      {(req.status === "APPROVED" || req.status === "SEND_FAILED" || req.status === "SENT_TO_LEGACY" || req.skDocument) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-4">Surat Keputusan & Integrasi</h3>

          {req.skDocument && (
            <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-green-800 font-medium">
                Nomor SK: {req.skDocument.skNumber}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                Digenerate {new Date(req.skDocument.generatedAt).toLocaleString("id-ID")}
              </p>
            </div>
          )}

          <SkActions
            leaveRequestId={id}
            currentStatus={req.status}
            hasSkDocument={!!req.skDocument}
            skNumber={req.skDocument?.skNumber}
          />
        </div>
      )}

      {/* Integration Logs */}
      {req.integrationLogs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-3">Log Integrasi ke Sistem Lama</h3>
          <div className="space-y-2">
            {req.integrationLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-xs">
                <span
                  className={`px-2 py-0.5 rounded font-medium shrink-0 ${
                    log.status === "SUCCESS"
                      ? "bg-green-100 text-green-700"
                      : log.status === "FAILED"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {log.status}
                </span>
                <span className="text-gray-400">
                  Percobaan ke-{log.attemptCount}
                  {log.lastAttemptAt && ` — ${new Date(log.lastAttemptAt).toLocaleString("id-ID")}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
