import ExcelJS from "exceljs"
import {
  formatDurasi,
  formatJam,
  formatTanggal,
  STATUS_LABEL,
  type OvertimeDetailRow,
  type OvertimeReportSummary,
} from "./overtime-types"

export async function buildOvertimeDetailExcel(
  rows: OvertimeDetailRow[],
  summary: OvertimeReportSummary,
  title: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "CutiSmart"
  wb.created = new Date()

  const ws = wb.addWorksheet("Lembur Detail")

  ws.columns = [
    { header: "Tanggal",     key: "tanggal",    width: 14 },
    { header: "NIP",         key: "nip",        width: 22 },
    { header: "Nama",        key: "nama",       width: 30 },
    { header: "Unit",        key: "unit",       width: 22 },
    { header: "Status",      key: "status",     width: 14 },
    { header: "Jam Masuk",   key: "masuk",      width: 12 },
    { header: "Jam Pulang",  key: "pulang",     width: 12 },
    { header: "Durasi",      key: "durasi",     width: 12 },
    { header: "Catatan",     key: "note",       width: 30 },
  ]

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }
  headerRow.alignment = { vertical: "middle", horizontal: "center" }
  headerRow.height = 20

  for (const r of rows) {
    const row = ws.addRow({
      tanggal: formatTanggal(r.tanggalKerja),
      nip:     r.nip,
      nama:    r.nama,
      unit:    r.unit,
      status:  STATUS_LABEL[r.status],
      masuk:   formatJam(r.masukAt),
      pulang:  formatJam(r.pulangAt),
      durasi:  formatDurasi(r.durasiMenit),
      note:    r.note ?? "-",
    })
    if (r.status === "DITOLAK") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }
    } else if (r.status === "SAH") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } }
    } else if (r.status === "DIAJUKAN" || r.status === "DISETUJUI_UNIT") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }]
  ws.autoFilter = { from: "A1", to: "I1" }

  const summaryText =
    `Total pengajuan: ${summary.totalPengajuan} · ` +
    `SAH: ${summary.totalSah} · ` +
    `Menunggu: ${summary.totalMenunggu} · ` +
    `Ditolak: ${summary.totalDitolak} · ` +
    `Total durasi: ${formatDurasi(summary.totalDurasiMenit)}`

  ws.insertRow(1, [summaryText])
  ws.mergeCells("A1:I1")
  const summaryRow = ws.getRow(1)
  summaryRow.font = { italic: true, size: 10, color: { argb: "FF64748B" } }
  summaryRow.alignment = { horizontal: "center" }

  ws.insertRow(1, [title])
  ws.mergeCells("A1:I1")
  const titleRow = ws.getRow(1)
  titleRow.font = { bold: true, size: 13 }
  titleRow.alignment = { horizontal: "center" }
  titleRow.height = 22

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
