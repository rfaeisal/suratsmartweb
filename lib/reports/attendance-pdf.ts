import PDFDocument from "pdfkit"
import { formatKeterangan, type AttendanceRow } from "./attendance-types"

export async function buildAttendancePdf(rows: AttendanceRow[], title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    doc.fontSize(14).font("Helvetica-Bold").text(title, { align: "center" })
    doc.moveDown(0.5)
    doc.fontSize(8).font("Helvetica").text(
      `Dicetak: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" })}`,
      { align: "right" },
    )
    doc.moveDown(0.3)

    const cols = [
      { label: "NIP",         w: 90  },
      { label: "Nama",        w: 110 },
      { label: "Unit",        w: 80  },
      { label: "Tgl Kerja",   w: 60  },
      { label: "Shift",       w: 55  },
      { label: "Jam Masuk",   w: 55  },
      { label: "Jam Pulang",  w: 55  },
      { label: "Status",      w: 42  },
      { label: "Telat",       w: 32  },
      { label: "Keterangan",  w: 96  },
    ]

    const startX = doc.page.margins.left
    let y = doc.y
    const rowH = 14
    const fontSize = 7

    function drawRow(cells: string[], bg?: string) {
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
        y = doc.page.margins.top
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

    const totalW = cols.reduce((s, c) => s + c.w, 0)
    doc.rect(startX, y, totalW, rowH).fill("#1D4ED8")
    let hx = startX
    doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("white")
    for (const col of cols) {
      doc.text(col.label, hx + 2, y + 3, { width: col.w - 4, lineBreak: false })
      hx += col.w
    }
    y += rowH

    // Manual WITA (UTC+8) formatting — hindari `toLocaleTimeString` dengan
    // timeZone yang bisa gagal di node alpine (small-icu build).
    const WITA_OFFSET_MS = 8 * 60 * 60 * 1000
    const timeFmt = (iso: string | null) => {
      if (!iso) return "-"
      const d = new Date(new Date(iso).getTime() + WITA_OFFSET_MS)
      const hh = String(d.getUTCHours()).padStart(2, "0")
      const mm = String(d.getUTCMinutes()).padStart(2, "0")
      return `${hh}:${mm}`
    }

    for (const r of rows) {
      const bg =
        r.status === "alpha"
          ? "#FEE2E2"
          : r.status === "belum"
          ? "#F3F4F6"
          : r.telat
          ? "#FEF9C3"
          : undefined
      const statusLabel =
        r.status === "hadir" ? "Hadir" : r.status === "alpha" ? "Alpha" : "Belum"
      drawRow(
        [
          r.nip,
          r.nama,
          r.unit,
          r.tanggalKerja,
          r.shift ?? "-",
          timeFmt(r.jamMasuk),
          timeFmt(r.jamPulang),
          statusLabel,
          r.telat ? "Ya" : "Tidak",
          formatKeterangan(r) || "-",
        ],
        bg,
      )
    }

    doc.end()
  })
}
