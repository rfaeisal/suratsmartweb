import ExcelJS from "exceljs"
import type { AttendanceRow } from "./attendance-types"

export async function buildAttendanceExcel(rows: AttendanceRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "CutiSmart"
  wb.created = new Date()

  const ws = wb.addWorksheet("Rekap Absensi")

  ws.columns = [
    { header: "NIP",           key: "nip",           width: 22 },
    { header: "Nama",          key: "nama",          width: 28 },
    { header: "Unit",          key: "unit",          width: 22 },
    { header: "Tanggal Kerja", key: "tanggalKerja",  width: 14 },
    { header: "Shift",         key: "shift",         width: 16 },
    { header: "Tipe Event",    key: "eventType",     width: 14 },
    { header: "Jam Rekam",     key: "recordedAt",    width: 20 },
    { header: "Status",        key: "status",        width: 10 },
    { header: "Telat",         key: "telat",         width: 8  },
    { header: "Flags",         key: "flags",         width: 20 },
  ]

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }
  headerRow.alignment = { vertical: "middle", horizontal: "center" }
  headerRow.height = 20

  for (const r of rows) {
    const row = ws.addRow({
      nip:          r.nip,
      nama:         r.nama,
      unit:         r.unit,
      tanggalKerja: r.tanggalKerja,
      shift:        r.shift ?? "-",
      eventType:    r.eventType ?? "-",
      recordedAt:   r.recordedAt
        ? new Date(r.recordedAt).toLocaleString("id-ID", { timeZone: "Asia/Makassar" })
        : "-",
      status:       r.status === "hadir" ? "Hadir" : "Alpha",
      telat:        r.telat ? "Ya" : "Tidak",
      flags:        r.flags.join(", ") || "-",
    })

    if (r.status === "alpha") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }
    } else if (r.telat) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }]
  ws.autoFilter = { from: "A1", to: "J1" }

  ws.insertRow(1, [title])
  ws.mergeCells("A1:J1")
  const titleRow = ws.getRow(1)
  titleRow.font = { bold: true, size: 13 }
  titleRow.alignment = { horizontal: "center" }
  titleRow.height = 22

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
