import PDFDocument from "pdfkit"
import {
  formatDurasi,
  type OvertimeReportSummary,
  type OvertimeSummaryRow,
} from "./overtime-types"

export async function buildOvertimeSummaryPdf(
  rows: OvertimeSummaryRow[],
  summary: OvertimeReportSummary,
  title: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "portrait" })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    doc.fontSize(14).font("Helvetica-Bold").text(title, { align: "center" })
    doc.moveDown(0.4)
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#475569")
      .text(
        `Pegawai: ${rows.length}  ·  Pengajuan: ${summary.totalPengajuan}  ·  SAH: ${summary.totalSah}  ·  Menunggu: ${summary.totalMenunggu}  ·  Ditolak: ${summary.totalDitolak}  ·  Total durasi: ${formatDurasi(summary.totalDurasiMenit)}`,
        { align: "center" },
      )
    doc.moveDown(0.6)
    doc.fillColor("black")

    const cols = [
      { label: "NIP",           w: 90  },
      { label: "Nama",          w: 130 },
      { label: "Unit",          w: 90  },
      { label: "Pengajuan",     w: 55  },
      { label: "SAH",           w: 35  },
      { label: "Menunggu",      w: 50  },
      { label: "Ditolak",       w: 45  },
      { label: "Total Durasi",  w: 60  },
    ]

    const startX = doc.page.margins.left
    let y = doc.y
    const rowH = 14
    const fontSize = 8

    function drawHeader() {
      const totalW = cols.reduce((s, c) => s + c.w, 0)
      doc.rect(startX, y, totalW, rowH).fill("#1D4ED8")
      let hx = startX
      doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("white")
      for (const col of cols) {
        doc.text(col.label, hx + 2, y + 3, { width: col.w - 4, lineBreak: false })
        hx += col.w
      }
      y += rowH
    }

    function drawRow(cells: string[]) {
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
        y = doc.page.margins.top
        drawHeader()
      }
      let x = startX
      doc.font("Helvetica").fontSize(fontSize).fillColor("black")
      for (let i = 0; i < cols.length; i++) {
        doc.text(cells[i] ?? "", x + 2, y + 3, { width: cols[i].w - 4, lineBreak: false, ellipsis: true })
        x += cols[i].w
      }
      y += rowH
    }

    drawHeader()

    for (const r of rows) {
      drawRow([
        r.nip,
        r.nama,
        r.unit,
        String(r.jumlahPengajuan),
        String(r.jumlahSah),
        String(r.jumlahMenunggu),
        String(r.jumlahDitolak),
        formatDurasi(r.totalDurasiMenit),
      ])
    }

    doc.end()
  })
}
