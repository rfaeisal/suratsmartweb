import ExcelJS from "exceljs"
import {
  highlightLevel,
  type MonthlyRecapRow,
  type MonthlyRecapSummary,
} from "./monthly-recap-types"

export async function buildMonthlyRecapExcel(
  rows: MonthlyRecapRow[],
  summary: MonthlyRecapSummary,
  title: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "CutiSmart"
  wb.created = new Date()

  const ws = wb.addWorksheet("Rekap Bulanan")

  ws.columns = [
    { header: "NIP",             key: "nip",         width: 22 },
    { header: "Nama",            key: "nama",        width: 30 },
    { header: "Unit",            key: "unit",        width: 22 },
    { header: "Hari Kerja",      key: "hariKerja",   width: 12 },
    { header: "Hadir",           key: "hadir",       width: 10 },
    { header: "Telat",           key: "telat",       width: 10 },
    { header: "% Kehadiran",     key: "persentase",  width: 14 },
    { header: "Ket.",            key: "warning",     width: 24 },
  ]

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }
  headerRow.alignment = { vertical: "middle", horizontal: "center" }
  headerRow.height = 20

  for (const r of rows) {
    const level = highlightLevel(r)
    const warning =
      level === "danger"
        ? "Kehadiran rendah"
        : level === "warning"
        ? "Sering telat"
        : ""
    const row = ws.addRow({
      nip:        r.nip,
      nama:       r.nama,
      unit:       r.unit,
      hariKerja:  r.hariKerja,
      hadir:      r.hadir,
      telat:      r.telat,
      persentase: `${r.persentase.toFixed(1)}%`,
      warning,
    })
    if (level === "danger") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }
    } else if (level === "warning") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }]
  ws.autoFilter = { from: "A1", to: "H1" }

  // Judul + summary di baris atas (insertRow di atas header).
  const summaryText =
    `Total pegawai: ${summary.totalPegawai} · ` +
    `Total hari kerja: ${summary.totalHariKerja} · ` +
    `Total hadir: ${summary.totalHadir} · ` +
    `Total telat: ${summary.totalTelat} · ` +
    `Rata-rata kehadiran: ${summary.rataPersentase.toFixed(1)}%`

  ws.insertRow(1, [summaryText])
  ws.mergeCells("A1:H1")
  const summaryRow = ws.getRow(1)
  summaryRow.font = { italic: true, size: 10, color: { argb: "FF64748B" } }
  summaryRow.alignment = { horizontal: "center" }
  summaryRow.height = 18

  ws.insertRow(1, [title])
  ws.mergeCells("A1:H1")
  const titleRow = ws.getRow(1)
  titleRow.font = { bold: true, size: 13 }
  titleRow.alignment = { horizontal: "center" }
  titleRow.height = 22

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
