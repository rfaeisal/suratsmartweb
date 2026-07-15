import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import path from "node:path"
import fs from "node:fs/promises"
import { prisma } from "@/lib/prisma"

// TODO: konfirmasi ke bagian kepegawaian — nama instansi, format nomor SK, dasar hukum yang berlaku
const INSTANSI_NAME = process.env.INSTANSI_NAME ?? "PEMERINTAH DAERAH"
const INSTANSI_UNIT = process.env.INSTANSI_UNIT ?? "DINAS/BADAN/LEMBAGA"

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 11, paddingTop: 40, paddingBottom: 50, paddingHorizontal: 60 },
  center: { textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 13, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 10, textAlign: "center", marginBottom: 16 },
  divider: { borderBottomWidth: 2, borderBottomColor: "#000", marginBottom: 16 },
  skNumber: { fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 16 },
  section: { marginBottom: 10 },
  sectionTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4, textDecoration: "underline" },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 160 },
  colon: { width: 14 },
  value: { flex: 1 },
  footer: { marginTop: 40, flexDirection: "row", justifyContent: "flex-end" },
  signatureBox: { width: 200, textAlign: "center" },
  signatureName: { fontFamily: "Helvetica-Bold", marginTop: 60 },
})

interface SkData {
  skNumber: string
  requestNumber: string
  requesterName: string
  requesterNip: string
  requesterPosition: string
  requesterUnit: string
  leaveTypeName: string
  startDate: string
  endDate: string
  totalDays: number
  approvalTrail: { roleLabel: string; approverName: string; decidedAt: string }[]
  generatedAt: string
}

function SkDocument({ data }: { data: SkData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Kop Surat */}
        <Text style={styles.title}>{INSTANSI_NAME}</Text>
        <Text style={styles.subtitle}>{INSTANSI_UNIT}</Text>
        <View style={styles.divider} />

        {/* Judul SK */}
        <Text style={[styles.bold, styles.center, { marginBottom: 4 }]}>
          KEPUTUSAN KEPALA {INSTANSI_UNIT.toUpperCase()}
        </Text>
        <Text style={styles.skNumber}>Nomor: {data.skNumber}</Text>
        <Text style={[styles.bold, styles.center, { marginBottom: 4 }]}>TENTANG</Text>
        <Text style={[styles.center, { marginBottom: 20 }]}>
          PEMBERIAN {data.leaveTypeName.toUpperCase()}
        </Text>

        {/* Menimbang */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MENIMBANG:</Text>
          <Text>
            bahwa berdasarkan pengajuan cuti yang telah melalui proses persetujuan berjenjang,
            dipandang perlu untuk memberikan {data.leaveTypeName} kepada pegawai yang bersangkutan.
          </Text>
        </View>

        {/* Mengingat */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MENGINGAT:</Text>
          {/* TODO: konfirmasi ke bagian kepegawaian — dasar hukum yang berlaku */}
          <Text>1. Undang-Undang Nomor 5 Tahun 2014 tentang Aparatur Sipil Negara;</Text>
          <Text>2. Peraturan Pemerintah Nomor 11 Tahun 2017 tentang Manajemen PNS;</Text>
          <Text>3. Peraturan BKN tentang Cuti Pegawai Negeri Sipil.</Text>
        </View>

        {/* Memutuskan */}
        <View style={styles.section}>
          <Text style={[styles.bold, styles.center, { marginBottom: 4 }]}>MEMUTUSKAN</Text>
          <View style={styles.row}>
            <Text style={[styles.bold]}>MENETAPKAN : </Text>
            <Text>Memberikan {data.leaveTypeName} kepada pegawai dengan data sebagai berikut:</Text>
          </View>
        </View>

        {/* Data Pegawai */}
        <View style={[styles.section, { marginLeft: 20 }]}>
          {[
            ["Nama", data.requesterName],
            ["NIP", data.requesterNip],
            ["Jabatan", data.requesterPosition],
            ["Unit Kerja", data.requesterUnit],
            ["Jenis Cuti", data.leaveTypeName],
            ["Tanggal Mulai", data.startDate],
            ["Tanggal Selesai", data.endDate],
            ["Jumlah Hari", `${data.totalDays} hari`],
            ["Nomor Pengajuan", data.requestNumber],
          ].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.colon}>:</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Alur Persetujuan */}
        {data.approvalTrail.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TELAH DISETUJUI OLEH:</Text>
            {data.approvalTrail.map((step, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{step.roleLabel}</Text>
                <Text style={styles.colon}>:</Text>
                <Text style={styles.value}>
                  {step.approverName} ({step.decidedAt})
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={{ marginTop: 10, fontSize: 10, color: "#555" }}>
          Ditetapkan pada tanggal: {data.generatedAt}
        </Text>

        {/* Tanda Tangan */}
        <View style={styles.footer}>
          <View style={styles.signatureBox}>
            <Text>Mengetahui,</Text>
            <Text>Kepala {INSTANSI_UNIT}</Text>
            <Text style={styles.signatureName}>(...........................)</Text>
            {/* TODO: nama + NIP penandatangan dikonfigurasi admin */}
          </View>
        </View>
      </Page>
    </Document>
  )
}

async function generateSkNumber(year: number): Promise<string> {
  // Count existing SK documents for this year to determine sequence number.
  // The caller should wrap in a transaction or handle unique constraint retry if needed.
  // TODO: konfirmasi ke bagian kepegawaian — format & sumber nomor SK yang berlaku
  const count = await prisma.skDocument.count({
    where: { generatedAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
  })
  return `${String(count + 1).padStart(3, "0")}/SK.CUTI/${year}`
}

export async function generateAndSaveSkPdf(leaveRequestId: string): Promise<{
  skNumber: string
  filePath: string
}> {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      requester: { select: { fullName: true, nip: true, positionTitle: true, unit: { select: { name: true } } } },
      leaveType: { select: { name: true } },
      approvalSteps: {
        where: { status: "APPROVED" },
        include: { approver: { select: { fullName: true } } },
        orderBy: { stepOrder: "asc" },
      },
    },
  })

  if (!req) throw new Error("Pengajuan tidak ditemukan")
  if (req.status !== "APPROVED") throw new Error("Pengajuan belum disetujui")

  const year = new Date().getFullYear()
  const skNumber = await generateSkNumber(year)

  const skData: SkData = {
    skNumber,
    requestNumber: req.requestNumber,
    requesterName: req.requester.fullName,
    requesterNip: req.requester.nip,
    requesterPosition: req.requester.positionTitle ?? "—",
    requesterUnit: req.requester.unit.name,
    leaveTypeName: req.leaveType.name,
    startDate: new Date(req.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
    endDate: new Date(req.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
    totalDays: req.totalDays,
    approvalTrail: req.approvalSteps.map((s) => ({
      roleLabel: s.roleLabel,
      approverName: s.approver.fullName,
      decidedAt: s.decidedAt ? new Date(s.decidedAt).toLocaleDateString("id-ID") : "—",
    })),
    generatedAt: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
  }

  const buffer = await renderToBuffer(<SkDocument data={skData} />)

  // Simpan ke filesystem
  const storageDir = path.join(process.env.FILE_STORAGE_PATH ?? "./uploads", "sk")
  await fs.mkdir(storageDir, { recursive: true })
  const fileName = `${req.requestNumber}.pdf`
  const filePath = path.join(storageDir, fileName)
  await fs.writeFile(filePath, buffer)

  return { skNumber, filePath }
}
