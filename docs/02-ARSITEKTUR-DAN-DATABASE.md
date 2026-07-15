# CutiSmart — Web (Next.js) — Arsitektur & Skema Database

## 1. Gambaran Arsitektur

```
[Flutter App Android] ---\
                           \
                            >  [Next.js App (App Router)] <--- Admin Panel (web UI, role-based)
                           /        |        \
[Web UI Pengajuan/Approval]        |         \
                                    |          > PostgreSQL (data cuti, master data, user)
                                    |
                                    > [API Integrasi] <--- HTTP/REST (HMAC/API key) ---> [Sistem Kepegawaian Lama (PHP)]
                                                                                          - SSO/validasi login
                                                                                          - Data profil pegawai
                                                                                          - Endpoint terima cuti disetujui
```

- **Next.js (App Router)** berperan ganda: backend API (route handlers `/app/api/**`) sekaligus frontend web (halaman pengajuan, approval, admin panel).
- **Flutter app** mengonsumsi API yang sama dengan yang dipakai frontend web (satu sumber API, lihat `04-API-SPEC.md`).
- **Sistem lama (PHP)** menyediakan dua arah komunikasi:
  1. Next.js memanggil sistem lama untuk **SSO** (validasi kredensial) dan **ambil data pegawai**.
  2. Next.js memanggil endpoint baru di sistem lama untuk **mengirim data cuti yang sudah disetujui**.

## 2. Rekomendasi Stack Teknis
| Layer | Pilihan |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions untuk mutasi internal) |
| Bahasa | TypeScript |
| ORM | Prisma (cocok untuk PostgreSQL, migrasi rapi, schema-first — memudahkan Claude Code membuat & mengubah skema) |
| Database | PostgreSQL 15+ |
| Auth | NextAuth.js (Auth.js) dengan **Credentials Provider custom** yang memvalidasi ke API SSO sistem lama, sesi disimpan sebagai JWT |
| Validasi | Zod |
| UI Admin/Web | Tailwind CSS + shadcn/ui |
| PDF Generation | `@react-pdf/renderer` atau Puppeteer (render HTML→PDF) untuk SK Cuti |
| Push Notification | Firebase Cloud Messaging (kirim dari server via `firebase-admin`) |
| Queue/Retry (opsional fase 2) | Sederhana dulu: tabel `integration_logs` + tombol retry manual di admin panel. Jika volume besar, pertimbangkan BullMQ + Redis di fase berikut |
| Deployment | Docker Compose (app + postgres) di server on-premise, reverse proxy Nginx + HTTPS (Let's Encrypt/internal CA) |

> Catatan: pilihan di atas adalah **rekomendasi awal**, Claude Code dapat menyesuaikan bila ada kendala di lingkungan on-premise (mis. versi Node.js yang tersedia).

## 3. Skema Database (PostgreSQL, via Prisma)

### 3.1 Master Data Pegawai (cache lokal, sumber kebenaran tetap sistem lama)
```prisma
model Employee {
  id             String   @id @default(cuid())
  legacyId       String   @unique   // ID pegawai di sistem lama
  nip            String   @unique
  fullName       String
  employeeType   EmployeeType        // PNS, PPPK, BLUD
  unitId         String
  unit           WorkUnit @relation(fields: [unitId], references: [id])
  positionTitle  String?
  directSupervisorId String?         // legacyId/Employee.id atasan langsung
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  leaveRequests     LeaveRequest[] @relation("Requester")
  delegatedRequests LeaveRequest[] @relation("Delegate")
  approvalSteps     ApprovalStep[]
}

enum EmployeeType {
  PNS
  PPPK
  BLUD
}

model WorkUnit {
  id        String  @id @default(cuid())
  name      String
  parentId  String?
  employees Employee[]
}
```

### 3.2 Jenis Cuti & Kuota (per kategori pegawai — configurable)
```prisma
model LeaveType {
  id                  String   @id @default(cuid())
  code                String   @unique   // e.g. CUTI_TAHUNAN, CUTI_SAKIT, CUTI_BESAR, CUTI_MELAHIRKAN, CUTI_ALASAN_PENTING, CLTN
  name                String
  applicableTo        EmployeeType[]      // jenis cuti ini berlaku untuk kategori pegawai mana saja
  requiresAttachment  Boolean  @default(false)   // wajib lampiran? (default opsional/false)
  defaultQuotaDays    Int?                // kuota default per tahun, null = tidak berbasis kuota (misal cuti besar per periode tertentu)
  isActive            Boolean  @default(true)

  quotas         LeaveQuota[]
  leaveRequests  LeaveRequest[]
}

model LeaveQuota {
  id            String   @id @default(cuid())
  employeeId    String
  employee      Employee @relation(fields: [employeeId], references: [id])
  leaveTypeId   String
  leaveType     LeaveType @relation(fields: [leaveTypeId], references: [id])
  year          Int
  totalDays     Int
  usedDays      Int      @default(0)

  @@unique([employeeId, leaveTypeId, year])
}
```
> Aturan detail tiap jenis cuti per kategori (PNS/PPPK/BLUD) diinput sebagai **data**, bukan logic hard-code, lewat admin panel (mis. tabel referensi `LeaveType.applicableTo` + kuota). Ini memudahkan penyesuaian tanpa ubah kode saat regulasi berubah.

### 3.3 Pengajuan Cuti
```prisma
model LeaveRequest {
  id              String   @id @default(cuid())
  requestNumber   String   @unique          // nomor pengajuan internal
  requesterId     String
  requester       Employee @relation("Requester", fields: [requesterId], references: [id])
  leaveTypeId     String
  leaveType       LeaveType @relation(fields: [leaveTypeId], references: [id])
  startDate       DateTime
  endDate         DateTime
  totalDays       Int
  reason          String
  delegateId      String?
  delegate        Employee? @relation("Delegate", fields: [delegateId], references: [id])
  status          LeaveRequestStatus @default(SUBMITTED)
  currentStepOrder Int      @default(0)
  delegateConfirmationStatus DelegateConfirmationStatus @default(PENDING)
  delegateDecidedAt DateTime?
  delegateNote      String?

  attachments     LeaveAttachment[]
  approvalSteps   ApprovalStep[]
  skDocument      SkDocument?
  integrationLog  IntegrationLog[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum LeaveRequestStatus {
  SUBMITTED             // baru diajukan, menunggu konfirmasi pegawai pengganti (delegasi)
  DELEGATE_DECLINED     // delegasi menolak jadi pengganti — pegawai harus pilih ulang & submit ulang
  PENDING_ADMIN_REVIEW  // delegasi sudah konfirmasi, menunggu admin kepegawaian menetapkan alur approval
  IN_APPROVAL           // alur approval sedang berjalan
  RETURNED              // dikembalikan ke pegawai untuk revisi
  REJECTED
  APPROVED              // seluruh tahap approval selesai, SK diterbitkan
  SENT_TO_LEGACY        // berhasil dikirim ke sistem lama
  SEND_FAILED           // gagal kirim ke sistem lama, perlu retry (admin bisa kirim ulang manual)
}

enum DelegateConfirmationStatus {
  PENDING     // menunggu pegawai pengganti konfirmasi
  CONFIRMED   // pegawai pengganti bersedia
  DECLINED    // pegawai pengganti menolak
}

model LeaveAttachment {
  id             String @id @default(cuid())
  leaveRequestId String
  leaveRequest   LeaveRequest @relation(fields: [leaveRequestId], references: [id])
  fileName       String
  filePath       String
  uploadedAt     DateTime @default(now())
}
```

### 3.4 Alur Approval (dinamis, ditetapkan admin kepegawaian per pengajuan)
```prisma
model ApprovalStep {
  id             String   @id @default(cuid())
  leaveRequestId String
  leaveRequest   LeaveRequest @relation(fields: [leaveRequestId], references: [id])
  stepOrder      Int                 // urutan tahap: 1, 2, 3, ...
  approverId     String
  approver       Employee @relation(fields: [approverId], references: [id])
  roleLabel      String              // "Atasan Langsung" | "Kepala Bagian" | "Wakil Direktur" | custom
  status         ApprovalStepStatus @default(PENDING)
  note           String?
  decidedAt      DateTime?

  @@unique([leaveRequestId, stepOrder])
}

enum ApprovalStepStatus {
  PENDING
  APPROVED
  REJECTED
  RETURNED
}
```
> Admin kepegawaian membuat baris `ApprovalStep` (1..N, bebas jumlah tahap & siapa approvernya) untuk tiap `LeaveRequest` setelah status `SUBMITTED`. Default template 3 tahap (Atasan Langsung → Kepala Bagian/Bidang → Wakil Direktur) disediakan sebagai *starting point* yang bisa diubah admin sebelum diaktifkan.

### 3.5 SK Cuti & Integrasi
```prisma
model SkDocument {
  id             String   @id @default(cuid())
  leaveRequestId String   @unique
  leaveRequest   LeaveRequest @relation(fields: [leaveRequestId], references: [id])
  skNumber       String   @unique
  filePath       String              // path PDF tersimpan
  generatedAt    DateTime @default(now())
}

model IntegrationLog {
  id             String   @id @default(cuid())
  leaveRequestId String
  leaveRequest   LeaveRequest @relation(fields: [leaveRequestId], references: [id])
  direction      String              // "PUSH_LEAVE_TO_LEGACY"
  status         String              // PENDING | SUCCESS | FAILED
  requestPayload Json
  responsePayload Json?
  attemptCount   Int      @default(0)
  lastAttemptAt  DateTime?
  createdAt      DateTime @default(now())
}
```

### 3.6 User, Sesi Login & Notifikasi
```prisma
model AppUser {
  id           String  @id @default(cuid())
  employeeId   String  @unique
  employee     Employee @relation(fields: [employeeId], references: [id])
  role         AppRole
  fcmTokens    FcmToken[]
  sessions     UserSession[]
}

enum AppRole {
  PEGAWAI
  APPROVER
  ADMIN_KEPEGAWAIAN
  SUPERADMIN
}

model UserSession {
  id               String   @id @default(cuid())
  userId           String
  user             AppUser  @relation(fields: [userId], references: [id])
  deviceId         String              // identifier unik device (mis. Android ID)
  deviceLabel      String?             // mis. "Samsung A54" untuk ditampilkan ke admin
  refreshTokenHash String   @unique    // simpan hash-nya saja, bukan token asli
  status           SessionStatus @default(ACTIVE)
  createdAt        DateTime @default(now())
  lastActiveAt     DateTime @default(now())
  revokedAt        DateTime?
  revokedBy        String?             // "SELF" | "ADMIN" | AppUser.id admin yang mencabut
}

enum SessionStatus {
  ACTIVE
  REVOKED
}

model FcmToken {
  id        String  @id @default(cuid())
  userId    String
  user      AppUser @relation(fields: [userId], references: [id])
  token     String  @unique
  platform  String  @default("android")
  createdAt DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  action     String
  entityType String
  entityId   String
  metadata   Json?
  createdAt  DateTime @default(now())
}
```
> **Kebijakan sesi**: satu `AppUser` hanya boleh punya **satu `UserSession` berstatus `ACTIVE`** dalam satu waktu. Percobaan login baru saat sesi lain masih `ACTIVE` akan ditolak (bukan otomatis mencabut sesi lama) — pegawai harus minta admin kepegawaian mencabut (revoke) sesi lama, atau logout dulu dari device lama. Sesi tidak punya masa kedaluwarsa otomatis (tidak ada batas waktu) — hanya berakhir jika di-*revoke* (oleh pegawai sendiri lewat tombol logout, atau oleh admin kepegawaian).

## 4. Catatan Desain Penting
- **Employee & unit** disinkron (cache) dari sistem lama secara berkala (job/endpoint sync) dan/atau saat login (SSO) — bukan diinput manual, untuk menghindari data ganda.
- Semua perubahan status penting (submit, konfirmasi delegasi, approval per tahap, kirim ke legacy) dicatat di `AuditLog`.
- `IntegrationLog` memungkinkan admin melihat riwayat pengiriman dan melakukan retry manual bila `SEND_FAILED`.
- **Konfirmasi delegasi bersifat wajib dan memblokir**: pengajuan tidak bisa diproses admin kepegawaian (tidak bisa ditetapkan alur approvalnya) selama `delegateConfirmationStatus` masih `PENDING`. Jika delegasi menolak (`DECLINED`), status `LeaveRequest` menjadi `DELEGATE_DECLINED` dan pegawai harus memilih pengganti lain lalu submit ulang.
- **Validasi sesi per-request**: karena sesi bisa dicabut kapan saja oleh admin (force sign-out) dan tidak punya masa kedaluwarsa otomatis, setiap request yang butuh autentikasi harus memvalidasi status `UserSession` terkait (bukan hanya memvalidasi signature JWT). JWT cukup menyimpan `sessionId` sebagai klaim; middleware auth mengecek `UserSession.status == ACTIVE` di database pada setiap request agar pencabutan sesi oleh admin langsung berefek (tidak menunggu token kedaluwarsa).
