export interface ExportRow {
  fullName: string
  nip: string
  employeeType: string
  positionTitle: string | null
  unitName: string | null
}

const EMP_TYPE_LABELS: Record<string, string> = {
  PNS: "PNS",
  PPPK: "PPPK",
  PPPK_PARUH_WAKTU: "PPPK Paruh Waktu",
  BLUD: "BLUD",
}

function toTableRows(rows: ExportRow[]) {
  return rows.map((e, i) => [
    i + 1,
    e.fullName,
    e.nip,
    EMP_TYPE_LABELS[e.employeeType] ?? e.employeeType,
    e.positionTitle ?? "—",
    e.unitName ?? "—",
  ])
}

const HEADERS = ["No", "Nama Lengkap", "NIP", "Jenis Pegawai", "Jabatan", "Unit Kerja"]

export async function exportToExcel(rows: ExportRow[], filename = "pegawai-belum-login") {
  const { utils, writeFile } = await import("xlsx")
  const ws = utils.aoa_to_sheet([HEADERS, ...toTableRows(rows)])
  ws["!cols"] = [{ wch: 5 }, { wch: 36 }, { wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 28 }]
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, "Belum Login")
  writeFile(wb, `${filename}.xlsx`)
}

export async function exportToPdf(rows: ExportRow[], filename = "pegawai-belum-login") {
  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })

  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text("Daftar Pegawai Belum Login ke CutiSmart", 14, 16)

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(120)
  doc.text(
    `Dicetak: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}  |  Total: ${rows.length} pegawai`,
    14,
    23,
  )
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 28,
    head: [HEADERS],
    body: toTableRows(rows),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      1: { cellWidth: 64 },
      2: { cellWidth: 38 },
      3: { cellWidth: 30 },
      4: { cellWidth: 50 },
      5: { cellWidth: 50 },
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  })

  doc.save(`${filename}.pdf`)
}
