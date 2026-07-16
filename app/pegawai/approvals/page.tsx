import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import Link from "next/link"

async function submitDecision(stepId: string, actorEmployeeId: string, formData: FormData) {
  "use server"
  const decision = formData.get("decision") as "APPROVED" | "REJECTED" | "RETURNED"
  const note = (formData.get("note") as string)?.trim()

  if (!decision) return
  if ((decision === "REJECTED" || decision === "RETURNED") && !note) return

  const step = await prisma.approvalStep.findUnique({
    where: { id: stepId },
    include: {
      leaveRequest: {
        include: {
          approvalSteps: { orderBy: { stepOrder: "asc" } },
        },
      },
    },
  })

  if (!step) return
  if (step.approverId !== actorEmployeeId) return
  if (step.status !== "PENDING") return
  if (step.leaveRequest.status !== "IN_APPROVAL" && step.leaveRequest.status !== "PENDING_KEPALA_RUANGAN") return
  if (step.stepOrder !== step.leaveRequest.currentStepOrder) return

  const isKepalaRuanganStep = step.leaveRequest.status === "PENDING_KEPALA_RUANGAN"
  const allSteps = step.leaveRequest.approvalSteps
  const isLastStep = step.stepOrder === Math.max(...allSteps.map((s) => s.stepOrder))
  const leaveRequestId = step.leaveRequestId

  await prisma.$transaction(async (tx) => {
    await tx.approvalStep.update({
      where: { id: stepId },
      data: { status: decision, note: note ?? null, decidedAt: new Date() },
    })

    if (decision === "APPROVED") {
      if (isKepalaRuanganStep) {
        // Kepala ruangan selesai → masuk antrian review admin kepegawaian
        await tx.leaveRequest.update({
          where: { id: leaveRequestId },
          data: { status: "PENDING_ADMIN_REVIEW", currentStepOrder: step.stepOrder },
        })
      } else if (isLastStep) {
        await tx.leaveRequest.update({
          where: { id: leaveRequestId },
          data: { status: "APPROVED", currentStepOrder: step.stepOrder },
        })
      } else {
        await tx.leaveRequest.update({
          where: { id: leaveRequestId },
          data: { currentStepOrder: step.stepOrder + 1 },
        })
      }
    } else {
      await tx.leaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          status: decision === "REJECTED" ? "REJECTED" : "RETURNED",
          currentStepOrder: step.stepOrder,
        },
      })
    }
  })

  await prisma.auditLog.create({
    data: {
      actorId: actorEmployeeId,
      action: `APPROVAL_${decision}`,
      entityType: "ApprovalStep",
      entityId: stepId,
      metadata: { leaveRequestId, note: note ?? null },
    },
  })

  revalidatePath("/pegawai/approvals")
}

export default async function ApprovalsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const employeeId = session.user.employeeId

  const steps = await prisma.approvalStep.findMany({
    where: {
      approverId: employeeId,
      status: "PENDING",
      leaveRequest: { status: { in: ["IN_APPROVAL", "PENDING_KEPALA_RUANGAN"] } },
    },
    include: {
      leaveRequest: {
        select: {
          id: true,
          requestNumber: true,
          status: true,
          currentStepOrder: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          reason: true,
          requester: {
            select: { fullName: true, nip: true, positionTitle: true, unit: { select: { name: true } } },
          },
          leaveType: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  // Hanya yang giliran aktif
  const activeSteps = steps.filter((s) => s.stepOrder === s.leaveRequest.currentStepOrder)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Inbox Persetujuan</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pengajuan yang menunggu keputusan Anda.
        </p>
      </div>

      {activeSteps.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">Tidak ada pengajuan yang menunggu persetujuan Anda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeSteps.map((step) => {
            const req = step.leaveRequest
            return (
              <div key={step.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-gray-400">{req.requestNumber}</span>
                      <span className="text-xs text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                        Langkah {step.stepOrder} — {step.roleLabel}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">{req.leaveType.name}</p>
                  </div>
                  <Link
                    href={`/pegawai/leave-requests/${req.id}`}
                    className="text-xs text-gray-400 hover:text-blue-600 shrink-0"
                  >
                    Detail →
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Pemohon</span>
                    <p className="text-gray-900">{req.requester.fullName}</p>
                    <p className="text-xs text-gray-400">{req.requester.unit?.name ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Tanggal</span>
                    <p className="text-gray-900">
                      {new Date(req.startDate).toLocaleDateString("id-ID")} —{" "}
                      {new Date(req.endDate).toLocaleDateString("id-ID")}
                    </p>
                    <p className="text-xs text-gray-400">{req.totalDays} hari</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 text-xs">Alasan</span>
                    <p className="text-gray-900">{req.reason}</p>
                  </div>
                </div>

                <form action={submitDecision.bind(null, step.id, employeeId)} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Catatan (wajib untuk tolak/kembalikan)
                    </label>
                    <input
                      name="note"
                      type="text"
                      placeholder="Catatan keputusan..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      name="decision"
                      value="APPROVED"
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Setujui
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="RETURNED"
                      className="px-4 py-2 bg-orange-50 text-orange-700 text-sm font-medium rounded-lg border border-orange-200 hover:bg-orange-100 transition-colors"
                    >
                      Kembalikan
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="REJECTED"
                      className="px-4 py-2 bg-red-50 text-red-700 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      Tolak
                    </button>
                  </div>
                </form>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
