import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import QRCode from "qrcode"

async function submitDecision(leaveRequestId: string, employeeId: string, formData: FormData) {
  "use server"
  const decision = formData.get("decision") as "CONFIRMED" | "DECLINED"
  const note = (formData.get("note") as string)?.trim()

  if (!decision) return
  if (decision === "DECLINED" && !note) return

  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: {
      id: leaveRequestId,
      delegateId: employeeId,
      status: "SUBMITTED",
      delegateConfirmationStatus: "PENDING",
    },
    include: { requester: { select: { unitId: true } } },
  })
  if (!leaveRequest) return

  if (decision === "DECLINED") {
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: "DELEGATE_DECLINED",
        delegateConfirmationStatus: "DECLINED",
        delegateDecidedAt: new Date(),
        delegateNote: note || null,
      },
    })
    await prisma.auditLog.create({
      data: { actorId: employeeId, action: "DELEGATE_DECLINED", entityType: "LeaveRequest", entityId: leaveRequestId, metadata: { note: note || null } },
    })
    revalidatePath("/pegawai/delegate-inbox")
    return
  }

  // Cek kepala ruangan di unit pemohon
  let kepalaRuanganId: string | null = null
  if (leaveRequest.requester.unitId) {
    const unit = await prisma.workUnit.findUnique({
      where: { id: leaveRequest.requester.unitId },
      select: { kepalaRuanganId: true },
    })
    kepalaRuanganId = unit?.kepalaRuanganId ?? null
  }

  if (kepalaRuanganId) {
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          status: "PENDING_KEPALA_RUANGAN",
          delegateConfirmationStatus: "CONFIRMED",
          delegateDecidedAt: new Date(),
          currentStepOrder: 1,
        },
      })
      await tx.approvalStep.create({
        data: { leaveRequestId, stepOrder: 1, approverId: kepalaRuanganId!, roleLabel: "Kepala Ruangan", status: "PENDING" },
      })
    })
  } else {
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: "PENDING_ADMIN_REVIEW",
        delegateConfirmationStatus: "CONFIRMED",
        delegateDecidedAt: new Date(),
      },
    })
  }

  await prisma.auditLog.create({
    data: { actorId: employeeId, action: "DELEGATE_CONFIRMED", entityType: "LeaveRequest", entityId: leaveRequestId, metadata: { kepalaRuanganId } },
  })

  revalidatePath("/pegawai/delegate-inbox")
}

export default async function DelegateInboxPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const employeeId = session.user.employeeId

  const pending = await prisma.leaveRequest.findMany({
    where: {
      delegateId: employeeId,
      delegateConfirmationStatus: "PENDING",
      status: "SUBMITTED",
    },
    include: {
      requester: {
        select: { fullName: true, nip: true, positionTitle: true, unit: { select: { name: true } } },
      },
      leaveType: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const qrMap = Object.fromEntries(
    await Promise.all(
      pending.map(async (req) => {
        const start = new Date(req.startDate).toLocaleDateString("id-ID")
        const end = new Date(req.endDate).toLocaleDateString("id-ID")
        const dataUrl = await QRCode.toDataURL(
          [
            `No: ${req.requestNumber}`,
            `Pemohon: ${req.requester.fullName}`,
            `NIP: ${req.requester.nip}`,
            `Jenis: ${req.leaveType.name}`,
            `Tgl: ${start} - ${end}`,
          ].join("\n"),
          { width: 80, margin: 1 },
        )
        return [req.id, dataUrl]
      }),
    ),
  )

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Inbox Konfirmasi Delegasi</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pegawai berikut menunjuk Anda sebagai pengganti selama mereka cuti. Konfirmasi kesediaan Anda.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">Tidak ada permintaan delegasi yang perlu dikonfirmasi.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((req) => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="font-medium text-gray-900">{req.requester.fullName}</p>
                  <p className="text-xs text-gray-500">
                    {req.requester.positionTitle} — {req.requester.unit?.name ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(req.createdAt).toLocaleDateString("id-ID")}
                  </p>
                </div>
                {qrMap[req.id] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrMap[req.id]}
                    alt="QR pengajuan"
                    width={64}
                    height={64}
                    className="shrink-0 rounded border border-gray-100"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div>
                  <span className="text-gray-500 text-xs">Jenis Cuti</span>
                  <p className="text-gray-900">{req.leaveType.name}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Tanggal</span>
                  <p className="text-gray-900">
                    {new Date(req.startDate).toLocaleDateString("id-ID")} —{" "}
                    {new Date(req.endDate).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 text-xs">Alasan</span>
                  <p className="text-gray-900">{req.reason}</p>
                </div>
              </div>

              {/* Form konfirmasi */}
              <form action={submitDecision.bind(null, req.id, employeeId)} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Catatan (wajib jika menolak)
                  </label>
                  <input
                    name="note"
                    type="text"
                    placeholder="Alasan penolakan atau catatan tambahan..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    name="decision"
                    value="CONFIRMED"
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Bersedia jadi Pengganti
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="DECLINED"
                    className="px-4 py-2 bg-red-50 text-red-700 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    Tolak
                  </button>
                </div>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
