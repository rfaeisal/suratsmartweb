import PDFDocument from "pdfkit"
import {
  highlightLevel,
  type MonthlyRecapRow,
  type MonthlyRecapSummary,
} from "./monthly-recap-types"

export async function buildMonthlyRecapPdf(
  rows: MonthlyRecapRow[],
  summary: MonthlyRecapSummary,
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
        `Total pegawai: ${summary.totalPegawai}   ·   ` +
          `Total hari kerja: ${summary.totalHariKerja}   ·   ` +
          `Total hadir: ${summary.totalHadir}   ·   ` +
          `Total telat: ${summary.totalTelat}   ·   ` +
          `Rata-rata kehadiran: ${summary.rataPersentase.toFixed(1)}%`,
        { align: "center" },
      )
    doc.moveDown(0.6)
    doc.fillColor("black")

    const cols = [
      { label: "NIP",         w: 85  },
      { label: "Nama",        w: 140 },
      { label: "Unit",        w: 90  },
      { label: "Hari",        w: 36  },
      { label: "Hadir",       w: 40  },
      { label: "Telat",       w: 40  },
      { label: "% Hadir",     w: 50  },
      { label: "Ket.",        w: 42  },
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

    function drawRow(cells: string[], bg?: string) {
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
        y = doc.page.margins.top
        drawHeader()
      }
      let x = startX
      if (bg) {
        doc.rect(startX, y, cols.reduce((s, c) => s + c.w, 0), rowH).fill(bg).stroke()
      }
      doc.font("Helvetica").fontSize(fontSize).fillColor("black")
      for (let i = 0; i < cols.length; i++) {
        doc.text(cells[i] ?? "", x + 2, y + 3, { width: cols[i].w - 4, lineBreak: false, ellipsis: true })
        x += cols[i].w
      }
      y += rowH
    }

    drawHeader()

    for (const r of rows) {
      const level = highlightLevel(r)
      const bg =
        level === "danger" ? "#FEE2E2" : level === "warning" ? "#FEF9C3" : undefined
      const warning =
        level === "danger" ? "Kehadiran rendah" : level === "warning" ? "Sering telat" : "-"
      drawRow(
        [
          r.nip,
          r.nama,
          r.unit,
          String(r.hariKerja),
          String(r.hadir),
          String(r.telat),
          `${r.persentase.toFixed(1)}%`,
          warning,
        ],
        bg,
      )
    }

    doc.end()
  })
}
