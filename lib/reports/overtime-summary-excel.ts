import ExcelJS from "exceljs"
import {
  formatDurasi,
  type OvertimeReportSummary,
  type OvertimeSummaryRow,
} from "./overtime-types"

export async function buildOvertimeSummaryExcel(
  rows: OvertimeSummaryRow[],
  summary: OvertimeReportSummary,
  title: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "CutiSmart"
  wb.created = new Date()

  const ws = wb.addWorksheet("Lembur Ringkasan")

  ws.columns = [
    { header: "NIP",             key: "nip",         width: 22 },
    { header: "Nama",            key: "nama",        width: 30 },
    { header: "Unit",            key: "unit",        width: 22 },
    { header: "Jml Pengajuan",   key: "pengajuan",   width: 14 },
    { header: "SAH",             key: "sah",         width: 8  },
    { header: "Menunggu",        key: "menunggu",    width: 10 },
    { header: "Ditolak",         key: "ditolak",     width: 10 },
    { header: "Total Durasi",    key: "durasi",      width: 14 },
  ]

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }
  headerRow.alignment = { vertical: "middle", horizontal: "center" }
  headerRow.height = 20

  for (const r of rows) {
    ws.addRow({
      nip:       r.nip,
      nama:      r.nama,
      unit:      r.unit,
      pengajuan: r.jumlahPengajuan,
      sah:       r.jumlahSah,
      menunggu:  r.jumlahMenunggu,
      ditolak:   r.jumlahDitolak,
      durasi:    formatDurasi(r.totalDurasiMenit),
    })
  }

  ws.views = [{ state: "frozen", ySplit: 1 }]
  ws.autoFilter = { from: "A1", to: "H1" }

  const summaryText =
    `Total pegawai: ${rows.length} · ` +
    `Total pengajuan: ${summary.totalPengajuan} · ` +
    `SAH: ${summary.totalSah} · ` +
    `Menunggu: ${summary.totalMenunggu} · ` +
    `Ditolak: ${summary.totalDitolak} · ` +
    `Total durasi: ${formatDurasi(summary.totalDurasiMenit)}`

  ws.insertRow(1, [summaryText])
  ws.mergeCells("A1:H1")
  const summaryRow = ws.getRow(1)
  summaryRow.font = { italic: true, size: 10, color: { argb: "FF64748B" } }
  summaryRow.alignment = { horizontal: "center" }

  ws.insertRow(1, [title])
  ws.mergeCells("A1:H1")
  const titleRow = ws.getRow(1)
  titleRow.font = { bold: true, size: 13 }
  titleRow.alignment = { horizontal: "center" }
  titleRow.height = 22

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
