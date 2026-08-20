import PDFDocument from "pdfkit"
import {
  formatDurasi,
  formatJam,
  formatTanggal,
  STATUS_LABEL,
  type OvertimeDetailRow,
  type OvertimeReportSummary,
} from "./overtime-types"

export async function buildOvertimeDetailPdf(
  rows: OvertimeDetailRow[],
  summary: OvertimeReportSummary,
  title: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" })
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
        `Pengajuan: ${summary.totalPengajuan}  ·  SAH: ${summary.totalSah}  ·  Menunggu: ${summary.totalMenunggu}  ·  Ditolak: ${summary.totalDitolak}  ·  Total durasi: ${formatDurasi(summary.totalDurasiMenit)}`,
        { align: "center" },
      )
    doc.moveDown(0.6)
    doc.fillColor("black")

    const cols = [
      { label: "Tanggal",    w: 70  },
      { label: "NIP",        w: 90  },
      { label: "Nama",       w: 130 },
      { label: "Unit",       w: 90  },
      { label: "Status",     w: 70  },
      { label: "Masuk",      w: 45  },
      { label: "Pulang",     w: 45  },
      { label: "Durasi",     w: 50  },
      { label: "Catatan",    w: 180 },
    ]

    const startX = doc.page.margins.left
    let y = doc.y
    const rowH = 14
    const fontSize = 7

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
      const bg =
        r.status === "DITOLAK"
          ? "#FEE2E2"
          : r.status === "SAH"
          ? "#DCFCE7"
          : r.status === "DIAJUKAN" || r.status === "DISETUJUI_UNIT"
          ? "#FEF9C3"
          : undefined
      drawRow(
        [
          formatTanggal(r.tanggalKerja),
          r.nip,
          r.nama,
          r.unit,
          STATUS_LABEL[r.status],
          formatJam(r.masukAt),
          formatJam(r.pulangAt),
          formatDurasi(r.durasiMenit),
          r.note ?? "-",
        ],
        bg,
      )
    }

    doc.end()
  })
}
