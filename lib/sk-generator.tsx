import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"

// react-pdf tidak export tipe Style secara langsung — gunakan inferensi dari StyleSheet
type PdfStyle = ReturnType<typeof StyleSheet.create>[string]
import QRCode from "qrcode"
import { prisma } from "@/lib/prisma"
import { savePdf } from "@/lib/storage"

// ─── Konfigurasi instansi ──────────────────────────────────────────────────────
// TODO: konfirmasi ke bagian kepegawaian — sesuaikan env var sebelum produksi
const INST_NAMA  = process.env.INSTANSI_NAMA    ?? "RSUD [nama instansi]"
const INST_KOTA  = process.env.INSTANSI_KOTA    ?? "[kota]"
const INST_YTH   = process.env.KEPADA_YTH       ?? "DIREKTUR [nama instansi]"
const INST_CQ    = process.env.KEPADA_CQ        ?? ""

// ─── Tipe Data ────────────────────────────────────────────────────────────────

interface ApproverInfo {
  roleLabel: string
  name: string
  nip: string
  decidedAt: string
}

interface QuotaRow {
  yearLabel: string  // "N-2" | "N-1" | "N"
  remaining: number | null
}

interface SkData {
  skNumber: string
  requestNumber: string
  submittedAt: string   // "06 Juni 2026"
  generatedAt: string   // "16 Juli 2026"
  // Pegawai
  requesterName: string
  requesterNip: string
  requesterPosition: string
  requesterUnit: string
  // Cuti
  leaveTypeName: string
  leaveTypeCode: string
  reason: string
  totalDays: number
  startDate: string
  endDate: string
  addressDuringLeave: string
  emergencyPhone: string
  // Kuota tahunan (section V)
  quotaRows: QuotaRow[]
  // Approval
  directSupervisor: ApproverInfo | null
  finalApprover: ApproverInfo | null
  // Delegasi
  delegateName: string | null
  delegateNip: string | null
  // QR data URLs
  qrPegawai: string
  qrAtasan: string | null
  qrPejabat: string | null
}

// ─── Helper QR ────────────────────────────────────────────────────────────────

async function buildQR(lines: string[]): Promise<string> {
  return QRCode.toDataURL(lines.join("\n"), {
    width: 90,
    margin: 1,
    errorCorrectionLevel: "M",
  })
}

// ─── Konstanta jenis cuti ─────────────────────────────────────────────────────

const LEAVE_MENU: [string, string, string, string][] = [
  ["1", "CUTI_TAHUNAN",       "Cuti Tahunan",                  "2"],
  ["3", "CUTI_SAKIT",         "Cuti Sakit",                    "4"],
  ["5", "CUTI_ALASAN_PENTING","Cuti Karena Alasan Penting",    "6"],
]
const LEAVE_RIGHT: [string, string][] = [
  ["2", "Cuti Besar"],
  ["4", "Cuti Melahirkan"],
  ["6", "Cuti di luar Tanggungan Negara"],
]
// map kode → label nomor untuk section V kanan
const LEAVE_SECTION_V: [string, string, string][] = [
  ["2", "CUTI_BESAR",         "CUTI BESAR"],
  ["3", "CUTI_SAKIT",         "CUTI SAKIT"],
  ["4", "CUTI_MELAHIRKAN",    "CUTI MELAHIRKAN"],
  ["5", "CUTI_ALASAN_PENTING","CUTI KARENA ALASAN PENTING"],
  ["6", "CLTN",               "CUTI DI LUAR TANGGUNGAN NEGARA"],
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 34,
  },

  // Typography
  bold: { fontFamily: "Helvetica-Bold" },
  underline: { textDecoration: "underline" },
  center: { textAlign: "center" },
  right: { textAlign: "right" },

  // Table helpers
  tbl: { borderWidth: 1, borderColor: "#000", marginBottom: 3 },
  row: { flexDirection: "row" },
  rowBorder: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000" },
  cell: { padding: 2, borderRightWidth: 1, borderRightColor: "#000" },
  cellLast: { padding: 2 },
  sHdr: {
    fontFamily: "Helvetica-Bold",
    padding: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
})

// ─── Komponen helper ──────────────────────────────────────────────────────────

const B = ({ children, style }: { children: React.ReactNode; style?: PdfStyle }) => (
  <Text style={[s.bold, style ?? {}]}>{children}</Text>
)

const Tbl = ({ children, mb = 3 }: { children: React.ReactNode; mb?: number }) => (
  <View style={[s.tbl, { marginBottom: mb }]}>{children}</View>
)

const Tr = ({ children, last = false }: { children: React.ReactNode; last?: boolean }) => (
  <View style={last ? s.row : s.rowBorder}>{children}</View>
)

const Td = ({
  children,
  w,
  last = false,
  bold = false,
  center = false,
  style = {},
}: {
  children?: React.ReactNode
  w: number | string
  last?: boolean
  bold?: boolean
  center?: boolean
  style?: PdfStyle
}) => (
  <View style={[last ? s.cellLast : s.cell, { width: w }, style]}>
    <Text style={[bold ? s.bold : {}, center ? s.center : {}]}>{children}</Text>
  </View>
)

const SHdr = ({ children }: { children: string }) => (
  <View style={s.sHdr}>
    <Text style={s.bold}>{children}</Text>
  </View>
)

function formatIdDate(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}

function ck(active: boolean) {
  return active ? "√" : " "
}

// ─── Blok QR + tanda tangan dalam box ────────────────────────────────────────

function SignBox({
  qr,
  name,
  nip,
  label,
  w,
}: {
  qr: string | null
  name: string
  nip: string
  label?: string
  w: number | string
}) {
  return (
    <View style={{ width: w, alignItems: "center", paddingTop: 4, paddingBottom: 4 }}>
      {label ? <Text style={{ fontSize: 7.5, marginBottom: 2 }}>{label}</Text> : null}
      {qr ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={qr} style={{ width: 64, height: 64, marginBottom: 2 }} />
      ) : (
        <View style={{ width: 64, height: 64, marginBottom: 2 }} />
      )}
      <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", textAlign: "center" }}>
        {name}
      </Text>
      <Text style={{ fontSize: 7, textAlign: "center" }}>NIP {nip}</Text>
    </View>
  )
}

// ─── Komponen Dokumen ─────────────────────────────────────────────────────────

function SkDocument({ data }: { data: SkData }) {
  const isAnnual = data.leaveTypeCode === "CUTI_TAHUNAN"
  const showAtasan = !!data.directSupervisor

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header: regulasi kanan + tanggal ──────────────────────────────── */}
        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          <View style={{ flex: 1 }} />
          <View style={{ width: 200 }}>
            <Text style={{ fontSize: 7.5 }}>ANAK LAMPIRAN I.b</Text>
            <Text style={{ fontSize: 7.5 }}>PERATURAN BADAN KEPEGAWAIAN NEGARA</Text>
            <Text style={{ fontSize: 7.5 }}>REPUBLIK INDONESIA</Text>
            <Text style={{ fontSize: 7.5 }}>NOMOR 24 TAHUN 2017</Text>
            <Text style={{ fontSize: 7.5 }}>TENTANG</Text>
            <Text style={{ fontSize: 7.5, textDecoration: "underline" }}>
              TATA CARA PEMBERIAN CUTI PEGAWAI NEGERI SIPIL
            </Text>
            <Text style={{ fontSize: 7.5, marginTop: 3 }}>
              {INST_KOTA}, {data.submittedAt}
            </Text>
          </View>
        </View>

        {/* ── Kepada ────────────────────────────────────────────────────────── */}
        <View style={{ marginBottom: 3, marginLeft: 4 }}>
          <Text>Kepada</Text>
          <View style={{ flexDirection: "row" }}>
            <Text>Yth. </Text>
            <Text style={s.bold}>{INST_YTH}</Text>
          </View>
          {INST_CQ ? (
            <View style={{ flexDirection: "row" }}>
              <Text>     CQ. </Text>
              <Text>{INST_CQ}</Text>
            </View>
          ) : null}
          <Text>di -</Text>
        </View>
        <Text style={[s.bold, s.center, { fontSize: 9, marginBottom: 4 }]}>
          {INST_KOTA.toUpperCase()}
        </Text>

        {/* ── Judul ─────────────────────────────────────────────────────────── */}
        <Text
          style={[
            s.bold,
            s.center,
            s.underline,
            { fontSize: 9, marginBottom: 4 },
          ]}
        >
          FORMULIR PERMINTAAN DAN PEMBERIAN CUTI
        </Text>

        {/* ── I. Data Pegawai ───────────────────────────────────────────────── */}
        <Tbl>
          <SHdr>I.    DATA PEGAWAI</SHdr>
          <Tr>
            <Td w={50} bold>Nama</Td>
            <Td w={130}>{data.requesterName}</Td>
            <Td w={28} bold>NIP</Td>
            <Td w={100} last>{data.requesterNip}</Td>
          </Tr>
          <Tr>
            <Td w={50} bold>Jabatan</Td>
            <Td w={130}>{data.requesterPosition}</Td>
            <Td w={28} bold>Masa Kerja</Td>
            <Td w={100} last>{/* TODO: tambahkan masa kerja ke model Employee */}</Td>
          </Tr>
          <Tr last>
            <Td w={50} bold>Unit kerja</Td>
            <Td w={258} last>{data.requesterUnit}</Td>
          </Tr>
        </Tbl>

        {/* ── II. Jenis Cuti ────────────────────────────────────────────────── */}
        <Tbl>
          <SHdr>II.   JENIS CUTI YANG DIAMBIL**</SHdr>
          <Tr>
            <Td w={10} center>{ck(data.leaveTypeCode === "CUTI_TAHUNAN")}</Td>
            <Td w={100}>1.  Cuti Tahunan</Td>
            <Td w={10} center>{ck(data.leaveTypeCode === "CUTI_BESAR")}</Td>
            <Td w={108} last>2.  Cuti Besar</Td>
          </Tr>
          <Tr>
            <Td w={10} center>{ck(data.leaveTypeCode === "CUTI_SAKIT")}</Td>
            <Td w={100}>3.  Cuti Sakit</Td>
            <Td w={10} center>{ck(data.leaveTypeCode === "CUTI_MELAHIRKAN")}</Td>
            <Td w={108} last>4.  Cuti Melahirkan</Td>
          </Tr>
          <Tr last>
            <Td w={10} center>{ck(data.leaveTypeCode === "CUTI_ALASAN_PENTING")}</Td>
            <Td w={100}>5.  Cuti Karena Alasan Penting</Td>
            <Td w={10} center>{ck(data.leaveTypeCode === "CLTN")}</Td>
            <Td w={108} last>6.  Cuti di luar Tanggungan Negara</Td>
          </Tr>
        </Tbl>

        {/* ── III. Alasan Cuti ─────────────────────────────────────────────── */}
        <Tbl>
          <SHdr>III.  ALASAN CUTI</SHdr>
          <Tr last>
            <Td w="100%" last style={{ minHeight: 24 }}>{data.reason}</Td>
          </Tr>
        </Tbl>

        {/* ── IV. Lamanya Cuti ──────────────────────────────────────────────── */}
        <Tbl>
          <SHdr>IV.   LAMANYA CUTI</SHdr>
          <Tr last>
            <Td w={35}>Selama</Td>
            <Td w={30} center bold>{data.totalDays}</Td>
            <Td w={20}>hari,</Td>
            <Td w={55}>Mulai tanggal</Td>
            <Td w={90} bold>{data.startDate}</Td>
            <Td w={16} center>s/d</Td>
            <Td w={90} last bold>{data.endDate}</Td>
          </Tr>
        </Tbl>

        {/* ── V. Catatan Cuti ──────────────────────────────────────────────── */}
        <Tbl>
          <SHdr>V.    CATATAN CUTI***</SHdr>
          <Tr last>
            {/* Kiri: tabel kuota tahunan */}
            <View style={{ width: 170, borderRightWidth: 1, borderRightColor: "#000" }}>
              <View style={[s.rowBorder]}>
                <View style={[s.cell, { width: 10 }]}>
                  <Text style={s.bold}>{ck(isAnnual)}</Text>
                </View>
                <View style={[s.cellLast]}>
                  <Text style={s.bold}>1. CUTI TAHUNAN</Text>
                </View>
              </View>
              {/* Sub-header */}
              <View style={s.rowBorder}>
                <Td w={35} bold center>Tahun</Td>
                <Td w={30} bold center>Sisa</Td>
                <Td w={105} last bold>Keterangan</Td>
              </View>
              {data.quotaRows.map((q) => (
                <Tr key={q.yearLabel}>
                  <Td w={35} center>{q.yearLabel}</Td>
                  <Td w={30} center>{q.remaining ?? ""}</Td>
                  <Td w={105} last style={{ minHeight: 12 }}></Td>
                </Tr>
              ))}
              {/* Isi baris N-2, N-1, N jika quotaRows kosong */}
              {data.quotaRows.length === 0 &&
                ["N-2", "N-1", "N"].map((y) => (
                  <Tr key={y}>
                    <Td w={35} center>{y}</Td>
                    <Td w={30} center></Td>
                    <Td w={105} last style={{ minHeight: 12 }}></Td>
                  </Tr>
                ))}
            </View>
            {/* Kanan: jenis cuti lain */}
            <View style={{ flex: 1, paddingLeft: 4, paddingTop: 2 }}>
              {LEAVE_SECTION_V.map(([no, code, label]) => (
                <View key={code} style={{ flexDirection: "row", marginBottom: 1 }}>
                  <Text style={[s.bold, { width: 10 }]}>{ck(data.leaveTypeCode === code)}</Text>
                  <Text>
                    {no}.  {label}
                  </Text>
                </View>
              ))}
            </View>
          </Tr>
        </Tbl>

        {/* ── VI. Alamat + Hormat Saya ─────────────────────────────────────── */}
        <Tbl>
          <SHdr>VI.   ALAMAT SELAMA MENJALANKAN CUTI</SHdr>
          <Tr last>
            {/* Kiri: alamat */}
            <View
              style={{
                flex: 1,
                borderRightWidth: 1,
                borderRightColor: "#000",
                padding: 4,
              }}
            >
              <Text>{data.addressDuringLeave || "—"}</Text>
              <View style={{ flexDirection: "row", marginTop: 4 }}>
                <Text style={s.bold}>TELP  </Text>
                <Text>{data.emergencyPhone || ""}</Text>
              </View>
            </View>
            {/* Kanan: hormat saya + QR pegawai */}
            <View style={{ width: 130, alignItems: "center", paddingTop: 4 }}>
              <Text style={{ marginBottom: 2 }}>Hormat saya,</Text>
              <Image src={data.qrPegawai} style={{ width: 64, height: 64, marginBottom: 2 }} />
              <Text style={[s.bold, { fontSize: 7.5, textAlign: "center" }]}>
                {data.requesterName}
              </Text>
              <Text style={{ fontSize: 7 }}>NIP {data.requesterNip}</Text>
            </View>
          </Tr>
        </Tbl>

        {/* ── VII. Pertimbangan Atasan Langsung ────────────────────────────── */}
        {showAtasan && (
          <Tbl>
            <SHdr>VII.  PERTIMBANGAN ATASAN LANGSUNG**</SHdr>
            <Tr>
              <Td w="25%" bold center>DISETUJUI</Td>
              <Td w="25%" bold center>PERUBAHAN****</Td>
              <Td w="25%" bold center>DITANGGUHKAN****</Td>
              <Td w="25%" bold center last>TIDAK DISETUJUI****</Td>
            </Tr>
            <Tr last>
              {/* Disetujui — QR atasan */}
              <View
                style={{
                  width: "25%",
                  borderRightWidth: 1,
                  borderRightColor: "#000",
                  alignItems: "center",
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 9, marginBottom: 2 }}>√</Text>
                {data.qrAtasan ? (
                  <Image
                    src={data.qrAtasan}
                    style={{ width: 60, height: 60, marginBottom: 2 }}
                  />
                ) : null}
                <Text style={[s.bold, { fontSize: 7, textAlign: "center" }]}>
                  {data.directSupervisor?.name ?? ""}
                </Text>
                <Text style={{ fontSize: 6.5 }}>NIP {data.directSupervisor?.nip ?? ""}</Text>
                <Text style={{ fontSize: 6.5, color: "#555" }}>
                  {data.directSupervisor?.decidedAt ?? ""}
                </Text>
              </View>
              <Td w="25%" last={false} style={{ minHeight: 80 }}></Td>
              <Td w="25%" last={false}></Td>
              <Td w="25%" last></Td>
            </Tr>
          </Tbl>
        )}

        {/* ── VIII. Keputusan Pejabat Berwenang ────────────────────────────── */}
        <Tbl>
          <SHdr>
            {showAtasan
              ? "VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI**"
              : "VII.  KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI**"}
          </SHdr>
          <Tr>
            <Td w="25%" bold center>DISETUJUI</Td>
            <Td w="25%" bold center>PERUBAHAN****</Td>
            <Td w="25%" bold center>DITANGGUHKAN****</Td>
            <Td w="25%" bold center last>TIDAK DISETUJUI****</Td>
          </Tr>
          <Tr last>
            <View
              style={{
                width: "25%",
                borderRightWidth: 1,
                borderRightColor: "#000",
                alignItems: "center",
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 9, marginBottom: 2 }}>√</Text>
              {data.qrPejabat ? (
                <Image
                  src={data.qrPejabat}
                  style={{ width: 60, height: 60, marginBottom: 2 }}
                />
              ) : null}
              <Text style={[s.bold, { fontSize: 7, textAlign: "center" }]}>
                {data.finalApprover?.name ?? ""}
              </Text>
              <Text style={{ fontSize: 6.5 }}>NIP {data.finalApprover?.nip ?? ""}</Text>
              <Text style={{ fontSize: 6.5, color: "#555" }}>
                {data.finalApprover?.decidedAt ?? ""}
              </Text>
            </View>
            <Td w="25%" last={false} style={{ minHeight: 80 }}></Td>
            <Td w="25%" last={false}></Td>
            <Td w="25%" last></Td>
          </Tr>
        </Tbl>

        {/* ── Pelimpahan Tugas ─────────────────────────────────────────────── */}
        {data.delegateName && (
          <View style={{ flexDirection: "row", marginBottom: 4, marginTop: 2 }}>
            <Text>
              •  Selama Menjalankan Cuti, Tugas-Tugas Kedinasan Diserahkan Kepada :{" "}
            </Text>
            <Text style={s.bold}>{data.delegateName}</Text>
          </View>
        )}
        {data.delegateNip && (
          <View style={{ marginLeft: 12, marginBottom: 6 }}>
            <Text>{data.delegateNip}</Text>
          </View>
        )}

        {/* ── Keterangan ────────────────────────────────────────────────────── */}
        <View style={{ marginTop: 2, borderTopWidth: 0.5, borderTopColor: "#666", paddingTop: 3 }}>
          <Text style={{ fontSize: 6.5, color: "#444" }}>Catatan:</Text>
          {[
            ["*",    "Coret yang tidak perlu"],
            ["**",   "Pilih salah satu dengan memberi tanda centang (√)"],
            ["***",  "Diisi oleh pejabat yang menangani bidang kepegawaian sebelum PNS mengajukan cuti"],
            ["****", "Diberi tanda centang dan alasannya"],
            ["N",    ": Cuti tahun berjalan"],
            ["N-1",  ": Sisa cuti 1 tahun sebelumnya"],
            ["N-2",  ": Sisa cuti 2 tahun sebelumnya"],
          ].map(([sym, txt]) => (
            <View key={sym} style={{ flexDirection: "row" }}>
              <Text style={{ fontSize: 6.5, color: "#444", width: 26 }}>{sym}</Text>
              <Text style={{ fontSize: 6.5, color: "#444" }}>{txt}</Text>
            </View>
          ))}
        </View>

        {/* ── Nomor SK & tanggal cetak (footer tipis) ─────────────────────── */}
        <Text
          style={{
            fontSize: 6,
            color: "#888",
            textAlign: "right",
            marginTop: 4,
          }}
        >
          No. SK: {data.skNumber}  •  No. Pengajuan: {data.requestNumber}  •  Dicetak: {data.generatedAt}
        </Text>

      </Page>
    </Document>
  )
}

// ─── Generate SK number ───────────────────────────────────────────────────────

async function generateSkNumber(year: number): Promise<string> {
  // TODO: konfirmasi ke bagian kepegawaian — format nomor SK yang berlaku
  const count = await prisma.skDocument.count({
    where: {
      generatedAt: {
        gte: new Date(`${year}-01-01`),
        lt:  new Date(`${year + 1}-01-01`),
      },
    },
  })
  return `${String(count + 1).padStart(3, "0")}/SK.CUTI/${year}`
}

// ─── Fungsi publik ────────────────────────────────────────────────────────────

export async function generateAndSaveSkPdf(leaveRequestId: string): Promise<{
  skNumber: string
  filePath: string
}> {
  const req = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      requester: {
        select: { fullName: true, nip: true, positionTitle: true, unit: { select: { name: true } } },
      },
      delegate: {
        select: { fullName: true, nip: true },
      },
      leaveType: { select: { name: true, code: true } },
      approvalSteps: {
        where: { status: "APPROVED" },
        include: { approver: { select: { fullName: true, nip: true } } },
        orderBy: { stepOrder: "asc" },
      },
    },
  })

  if (!req) throw new Error("Pengajuan tidak ditemukan")
  if (req.status !== "APPROVED") throw new Error("Pengajuan belum disetujui")

  const year = new Date().getFullYear()
  const skNumber = await generateSkNumber(year)

  // Kuota tahunan (N-2, N-1, N) — hanya relevan untuk CUTI_TAHUNAN
  let quotaRows: QuotaRow[] = []
  if (req.leaveType.code === "CUTI_TAHUNAN") {
    const quotas = await prisma.leaveQuota.findMany({
      where: {
        employeeId: req.requesterId,
        leaveTypeId: req.leaveTypeId,
        year: { gte: year - 2, lte: year },
      },
    })
    quotaRows = [year - 2, year - 1, year].map((y) => {
      const q = quotas.find((x) => x.year === y)
      return {
        yearLabel: y === year ? "N" : y === year - 1 ? "N-1" : "N-2",
        remaining: q ? q.totalDays - q.usedDays : null,
      }
    })
  }

  // Pisahkan atasan langsung (step 1) dan pejabat berwenang (step terakhir)
  const steps = req.approvalSteps
  const directSupervisor: ApproverInfo | null =
    steps.length > 1
      ? {
          roleLabel: steps[0].roleLabel,
          name: steps[0].approver.fullName,
          nip: steps[0].approver.nip,
          decidedAt: steps[0].decidedAt
            ? formatIdDate(new Date(steps[0].decidedAt))
            : "—",
        }
      : null

  const lastStep = steps[steps.length - 1]
  const finalApprover: ApproverInfo | null = lastStep
    ? {
        roleLabel: lastStep.roleLabel,
        name: lastStep.approver.fullName,
        nip: lastStep.approver.nip,
        decidedAt: lastStep.decidedAt
          ? formatIdDate(new Date(lastStep.decidedAt))
          : "—",
      }
    : null

  // QR codes
  const qrPegawai = await buildQR([
    `Pengajuan : ${req.requestNumber}`,
    `Pemohon   : ${req.requester.fullName}`,
    `NIP       : ${req.requester.nip}`,
    `Cuti      : ${req.leaveType.name}`,
    `Tanggal   : ${formatIdDate(new Date(req.createdAt))}`,
  ])

  const qrAtasan = directSupervisor
    ? await buildQR([
        `Pengajuan : ${req.requestNumber}`,
        `Approver  : ${directSupervisor.name}`,
        `NIP       : ${directSupervisor.nip}`,
        `Jabatan   : ${directSupervisor.roleLabel}`,
        `Tgl Setuju: ${directSupervisor.decidedAt}`,
        `Status    : DISETUJUI`,
      ])
    : null

  const qrPejabat = finalApprover
    ? await buildQR([
        `Pengajuan : ${req.requestNumber}`,
        `Approver  : ${finalApprover.name}`,
        `NIP       : ${finalApprover.nip}`,
        `Jabatan   : ${finalApprover.roleLabel}`,
        `Tgl Setuju: ${finalApprover.decidedAt}`,
        `Status    : DISETUJUI`,
      ])
    : null

  const skData: SkData = {
    skNumber,
    requestNumber: req.requestNumber,
    submittedAt: formatIdDate(new Date(req.createdAt)),
    generatedAt: formatIdDate(new Date()),
    requesterName:     req.requester.fullName,
    requesterNip:      req.requester.nip,
    requesterPosition: req.requester.positionTitle ?? "—",
    requesterUnit:     req.requester.unit?.name ?? "—",
    leaveTypeName: req.leaveType.name,
    leaveTypeCode: req.leaveType.code,
    reason:        req.reason,
    totalDays:     req.totalDays,
    startDate: formatIdDate(new Date(req.startDate)),
    endDate:   formatIdDate(new Date(req.endDate)),
    addressDuringLeave: req.addressDuringLeave ?? "",
    emergencyPhone: req.emergencyPhone ?? "",
    quotaRows,
    directSupervisor,
    finalApprover,
    delegateName: req.delegate?.fullName ?? null,
    delegateNip:  req.delegate?.nip ?? null,
    qrPegawai,
    qrAtasan,
    qrPejabat,
  }

  const buffer = await renderToBuffer(<SkDocument data={skData} />)
  const fileName = `${req.requestNumber}.pdf`
  const filePath = await savePdf(buffer, fileName)

  return { skNumber, filePath }
}
