import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"

function escapeCsv(val: unknown): string {
  const str = val === null || val === undefined ? "" : String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function row(cols: unknown[]): string {
  return cols.map(escapeCsv).join(",")
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const roles = session.user.roles
  if (!roles.includes("ADMIN_KEPEGAWAIAN") && !roles.includes("SUPERADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const unitId = searchParams.get("unitId")
  const leaveTypeId = searchParams.get("leaveTypeId")
  const employeeType = searchParams.get("employeeType")

  const currentYear = new Date().getFullYear()
  const dateFrom = new Date(from ?? `${currentYear}-01-01`)
  const dateTo = new Date(to ?? `${currentYear}-12-31`)
  dateTo.setHours(23, 59, 59, 999)

  const where: Record<string, unknown> = {
    startDate: { gte: dateFrom },
    endDate: { lte: dateTo },
    status: { in: ["APPROVED", "SENT_TO_LEGACY"] },
  }
  if (leaveTypeId) where.leaveTypeId = leaveTypeId
  if (unitId || employeeType) {
    where.requester = {
      ...(unitId ? { unitId } : {}),
      ...(employeeType ? { employeeType } : {}),
    }
  }

  const requests = await prisma.leaveRequest.findMany({
    where,
    include: {
      requester: {
        select: {
          fullName: true,
          nip: true,
          employeeType: true,
          unit: { select: { name: true } },
        },
      },
      leaveType: { select: { name: true } },
      skDocument: { select: { skNumber: true } },
    },
    orderBy: { startDate: "asc" },
  })

  const header = row([
    "No. Pengajuan",
    "Nama Pegawai",
    "NIP",
    "Kategori",
    "Unit Kerja",
    "Jenis Cuti",
    "Tanggal Mulai",
    "Tanggal Selesai",
    "Jumlah Hari",
    "Nomor SK",
    "Status",
  ])

  const lines = requests.map((r) =>
    row([
      r.requestNumber,
      r.requester.fullName,
      r.requester.nip,
      r.requester.employeeType,
      r.requester.unit?.name ?? "",
      r.leaveType.name,
      new Date(r.startDate).toLocaleDateString("id-ID"),
      new Date(r.endDate).toLocaleDateString("id-ID"),
      r.totalDays,
      r.skDocument?.skNumber ?? "",
      r.status,
    ])
  )

  const csv = [header, ...lines].join("\n")
  const filename = `rekap-cuti-${from ?? currentYear}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
