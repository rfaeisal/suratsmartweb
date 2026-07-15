# CutiSmart — Spesifikasi API

Base path: `/api/v1`

API ini dikonsumsi oleh dua klien:
- **Flutter (mobile)** — via REST + Bearer token. Scope terbatas: pengajuan cuti, konfirmasi delegasi, approval, dan melihat progress pengajuan.
- **Web admin panel** — via fetch internal (NextAuth session cookie). Scope penuh: seluruh fitur admin kepegawaian.

Setiap endpoint di bawah diberi label **`[Mobile]`** atau **`[Web]`** untuk memperjelas klien mana yang menggunakannya. Endpoint berlabel **`[Mobile]`** juga bisa dipanggil dari web (shared endpoint), sedangkan **`[Web]`** adalah eksklusif admin panel.

---

## Ringkasan Endpoint Mobile (Flutter)

Hanya endpoint berikut yang perlu diimplementasikan di sisi Flutter:

| Kelompok | Endpoint |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/fcm-token` |
| Master data | `GET /leave-types`, `GET /units/:unitId/employees` |
| Pengajuan | `POST /attachments`, `POST /leave-requests`, `GET /leave-requests`, `GET /leave-requests/:id` |
| Konfirmasi delegasi | `GET /delegate-confirmations/inbox`, `POST /delegate-confirmations/:id/decision` |
| Approval | `GET /approvals/inbox`, `POST /approvals/:stepId/decision` |
| SK | `GET /leave-requests/:id/sk` |

Semua endpoint admin (`/admin/*`) dan manajemen sesi/role adalah **web-only** dan tidak perlu diintegrasikan di Flutter.

---

## 1. Autentikasi & Sesi Login `[Mobile]`

Mobile app memakai **sesi persisten**: token disimpan di device, pegawai tidak perlu login ulang setiap membuka app. Sesi **tidak kedaluwarsa otomatis** — hanya berakhir saat sign out sendiri atau di-*revoke* admin. **Hanya boleh ada satu sesi aktif per akun** — login di device lain saat sesi masih aktif akan ditolak.

### `POST /api/v1/auth/login` `[Mobile]`
```json
{
  "username": "string",
  "password": "string",
  "deviceId": "string",
  "deviceLabel": "string (opsional, mis. model HP)"
}
```
Alur internal:
1. Next.js validasi kredensial ke SSO sistem lama.
2. Sinkron data pegawai ke tabel `Employee` lokal.
3. **Cek sesi aktif**: jika sudah ada `UserSession` berstatus `ACTIVE` dari device lain, login **ditolak** (`SESSION_ALREADY_ACTIVE`). Re-login dari `deviceId` yang sama diperbolehkan.
4. Jika lolos, terbitkan access token (JWT, ~1 jam) + refresh token (tanpa kedaluwarsa, disimpan ter-hash).

Response sukses:
```json
{
  "accessToken": "jwt...",
  "refreshToken": "opaque-token...",
  "user": {
    "id": "...",
    "nip": "...",
    "fullName": "...",
    "employeeType": "PNS",
    "roles": ["PEGAWAI"],
    "unit": { "id": "...", "name": "..." }
  }
}
```
Nilai yang valid untuk `employeeType`: `PNS`, `PPPK`, `PPPK_PARUH_WAKTU`, `BLUD`.

> **`unit` bisa `null`** — jika admin belum menetapkan unit kerja pegawai di CutiSmart. Flutter harus menangani nilai `null` pada field ini.

> **`roles` adalah array** — satu user bisa punya lebih dari satu role (mis. `["PEGAWAI", "APPROVER"]`). Role `PEGAWAI` **selalu ada** di setiap akun — tidak bisa dihapus. Flutter harus menampilkan UI untuk **semua** role yang dimiliki secara bersamaan (mis. tab "Pengajuan Saya" dan tab "Inbox Approval" sekaligus).

Response gagal — sesi lain masih aktif:
```json
{
  "error": {
    "code": "SESSION_ALREADY_ACTIVE",
    "message": "Akun sedang login di device lain",
    "details": { "deviceLabel": "Samsung A54", "loggedInSince": "2026-07-01T08:00:00Z" }
  }
}
```

### `POST /api/v1/auth/refresh` `[Mobile]`
Body: `{ "refreshToken": "..." }`

Dipanggil secara berkala/otomatis untuk mendapatkan access token baru. Jika sesi sudah di-revoke (mis. oleh admin), mengembalikan `401 SESSION_REVOKED` — Flutter harus hapus token tersimpan dan tampilkan layar login.

### `GET /api/v1/auth/me` `[Mobile]`
Dipanggil saat app pertama dibuka untuk auto-login: validasi sesi masih `ACTIVE` + ambil data user terbaru.
Response: `{ id, nip, fullName, employeeType, roles: string[], unit: { id, name } | null }`
Field `unit` bisa `null` jika admin belum menetapkan unit kerja. Jika sesi tidak valid → `401`.

### `POST /api/v1/auth/logout` `[Mobile]`
Revoke `UserSession` device yang sedang login (`revokedBy: "SELF"`) dan hapus FCM token device tersebut.

### `POST /api/v1/auth/fcm-token` `[Mobile]`
Body: `{ "token": "fcm_device_token" }` — daftarkan token FCM device untuk push notification.

> Kebijakan satu sesi aktif berlaku **khusus mobile**. Web admin panel memakai sesi browser via NextAuth secara terpisah — pegawai bisa login web dan mobile bersamaan tanpa saling memblokir.

Semua endpoint di bawah membutuhkan header `Authorization: Bearer <accessToken>`.

---

## 2. Master Data (Read-only) `[Mobile]`

### `GET /api/v1/leave-types` `[Mobile]`
Jenis cuti yang berlaku untuk `employeeType` user yang login, beserta sisa kuota tahun berjalan.
```json
[
  { "id": "...", "code": "CUTI_TAHUNAN", "name": "Cuti Tahunan", "requiresAttachment": false, "remainingDays": 8 },
  { "id": "...", "code": "CUTI_SAKIT", "name": "Cuti Sakit", "requiresAttachment": false, "remainingDays": null }
]
```

### `GET /api/v1/units/:unitId/employees` `[Mobile]`
Daftar pegawai satu unit (untuk dropdown pilih pegawai pengganti/delegasi saat membuat pengajuan).

---

## 3. Pengajuan Cuti `[Mobile]`

### `POST /api/v1/attachments` (multipart/form-data) `[Mobile]`
Upload lampiran sebelum submit pengajuan. Mengembalikan `{ "fileId": "..." }` yang direferensikan di `attachmentFileIds` saat POST leave-request.
File yang diizinkan: PDF, JPG, PNG. Maks 5 MB per file.

### `POST /api/v1/leave-requests` `[Mobile]`
```json
{
  "leaveTypeId": "...",
  "startDate": "2026-08-01",
  "endDate": "2026-08-05",
  "reason": "string (min. 5 karakter)",
  "addressDuringLeave": "string (opsional, min. 5 karakter) — alamat tinggal selama cuti",
  "delegateEmployeeId": "...",
  "attachmentFileIds": ["fileId-1", "fileId-2"]
}
```
Response: objek `LeaveRequest` dengan status `SUBMITTED`.

Validasi server:
- `endDate` ≥ `startDate`
- Jenis cuti harus berlaku untuk `employeeType` user
- `delegateEmployeeId` harus pegawai aktif di unit yang sama, bukan diri sendiri
- Jika `leaveType.requiresAttachment = true`, `attachmentFileIds` tidak boleh kosong
- Kuota harus mencukupi (jika jenis cuti punya kuota)

### `GET /api/v1/leave-requests` `[Mobile]`
Query params: `status` (opsional), `mine=true` (default untuk pegawai biasa).
List pengajuan milik user yang login, diurutkan terbaru.

### `GET /api/v1/leave-requests/:id` `[Mobile]`
Detail lengkap pengajuan: data pengaju, jenis cuti, tanggal, alasan, `addressDuringLeave`, pegawai pengganti, status konfirmasi delegasi, `approvalSteps[]` (beserta status tiap tahap), dan referensi SK jika sudah terbit.

---

## 4. Konfirmasi Delegasi `[Mobile]`

Pegawai yang ditunjuk sebagai pengganti harus mengonfirmasi kesediaannya sebelum admin dapat memproses pengajuan. Notifikasi push dikirim ke device pegawai pengganti saat ditunjuk.

### `GET /api/v1/delegate-confirmations/inbox` `[Mobile]`
Daftar pengajuan di mana user yang login ditunjuk sebagai pengganti dan statusnya masih `PENDING`.

### `POST /api/v1/delegate-confirmations/:leaveRequestId/decision` `[Mobile]`
```json
{ "decision": "CONFIRMED", "note": "string (wajib jika DECLINED)" }
```
`decision`: `CONFIRMED` | `DECLINED`

Efek:
- `CONFIRMED` → status pengajuan berubah dari `SUBMITTED` ke `PENDING_ADMIN_REVIEW`, muncul di antrean admin kepegawaian.
- `DECLINED` → status pengajuan menjadi `DELEGATE_DECLINED`, notifikasi dikirim ke pegawai pengaju agar memilih pengganti lain dan submit ulang.

---

## 5. Approval `[Mobile]`

Semua tahap approval (Atasan Langsung, Kepala Bagian, Kabag TU, Wakil Direktur, Direktur, dst.) memakai endpoint yang sama. Notifikasi push dikirim ke approver berikutnya saat gilirannya tiba.

### `GET /api/v1/approvals/inbox` `[Mobile]`
Daftar pengajuan yang menunggu keputusan dari user yang login (`ApprovalStep` berstatus `PENDING` dengan `approverId == currentUser`).

### `POST /api/v1/approvals/:approvalStepId/decision` `[Mobile]`
```json
{ "decision": "APPROVED", "note": "string (opsional, wajib jika RETURNED)" }
```
`decision`: `APPROVED` | `REJECTED` | `RETURNED`

Efek:
- `APPROVED` + masih ada tahap berikutnya → status tetap `IN_APPROVAL`, notifikasi ke approver berikutnya.
- `APPROVED` + tahap terakhir → status `APPROVED`, SK di-generate (async), data dikirim ke sistem lama.
- `REJECTED` atau `RETURNED` → status pengajuan ikut berubah, notifikasi ke pegawai pengaju.

---

## 6. Dokumen SK `[Mobile]`

### `GET /api/v1/leave-requests/:id/sk` `[Mobile]`
Mengembalikan metadata SK + URL unduh PDF setelah pengajuan berstatus `APPROVED` atau `SENT_TO_LEGACY`.

---

## 7. Admin Kepegawaian `[Web]`

Seluruh endpoint di bawah ini adalah **web-only** dan tidak digunakan oleh Flutter.

### `POST /api/v1/admin/leave-requests/:id/approval-flow` `[Web]`
Menetapkan atau menyusun ulang alur approval. **Hanya bisa dipanggil jika `delegateConfirmationStatus = CONFIRMED`** — jika belum, mengembalikan `INVALID_APPROVAL_STATE`.
```json
{
  "steps": [
    { "stepOrder": 1, "approverEmployeeId": "...", "roleLabel": "Atasan Langsung (opsional)" },
    { "stepOrder": 2, "approverEmployeeId": "...", "roleLabel": "Kepala Bagian TU (opsional)" },
    { "stepOrder": 3, "approverEmployeeId": "..." }
  ]
}
```
Setelah dipanggil, status pengajuan berubah ke `IN_APPROVAL` dan notifikasi dikirim ke approver tahap 1.

### `GET /api/v1/admin/leave-requests` `[Web]`
List semua pengajuan dengan filter: `status`, `unitId`, `leaveTypeId`, rentang tanggal.

### `GET /api/v1/admin/leave-requests/:id/sk/print` `[Web]`
Mengembalikan file PDF SK untuk dicetak langsung dari admin panel.

### `POST /api/v1/admin/integration-logs/:id/retry` `[Web]`
Kirim ulang manual data cuti ke sistem lama untuk log berstatus `FAILED` (dipakai saat status pengajuan `SEND_FAILED`).

### `GET /api/v1/admin/reports/leave-recap` `[Web]`
Rekapan cuti untuk periode tertentu.
Query params: `startDate`, `endDate`, `unitId` (opsional), `employeeType` (opsional — nilai: `PNS`, `PPPK`, `PPPK_PARUH_WAKTU`, `BLUD`), `leaveTypeId` (opsional).
```json
{
  "period": { "startDate": "2026-01-01", "endDate": "2026-06-30" },
  "summary": [
    { "unit": "Bagian Umum", "employeeType": "PNS", "leaveType": "Cuti Tahunan", "totalRequests": 12, "totalDays": 58 }
  ],
  "details": [
    { "requestNumber": "CS-2026-000123", "employeeName": "...", "leaveType": "...", "startDate": "...", "endDate": "...", "totalDays": 5, "status": "SENT_TO_LEGACY" }
  ]
}
```

### CRUD Master Data `[Web]`
- `GET/POST/PUT /api/v1/admin/leave-types`
- `GET/POST/PUT /api/v1/admin/leave-quotas`
- `GET/POST/PUT /api/v1/admin/units`

### Manajemen Pengguna `[Web]`

Halaman admin `/admin/users` (khusus SUPERADMIN) menampilkan dua tab:

**Tab 1 — Pengguna Terdaftar**: daftar `AppUser` yang sudah pernah login. Bisa dicari berdasarkan nama, NIP, atau username; difilter berdasarkan role. Menampilkan field `username` (diisi otomatis saat login; tampil `—` jika masih `null`).

**Tab 2 — Belum Pernah Login**: daftar `Employee` aktif yang belum punya `AppUser` (query: `where: { isActive: true, user: null }`). Berguna untuk memantau adopsi sistem. Dilengkapi fitur export:
- **Export Excel** (`xlsx`) — file `.xlsx` dengan 6 kolom: No, Nama Lengkap, NIP, Jenis Pegawai, Jabatan, Unit Kerja.
- **Export PDF** (`jspdf` + `jspdf-autotable`) — landscape A4, header biru, baris selang-seling abu, tanggal cetak tercantum.

Implementasi export via `lib/export/never-logged-in.ts` dengan dynamic import agar tidak membesar bundle awal.

### Manajemen Role Pengguna `[Web]`

#### `GET /api/v1/admin/users/:id/roles`
Melihat roles user.
```json
{ "id": "...", "username": "budi.santoso", "roles": ["PEGAWAI", "APPROVER"], "employee": { "fullName": "Budi Santoso", "nip": "198501012010011001" } }
```
Field `username` bisa `null` jika pegawai belum pernah login.

#### `PUT /api/v1/admin/users/:id/roles`
Mengubah roles user (replace semua). Body: `{ "roles": ["PEGAWAI", "APPROVER"] }`. Minimal 1 role. Role `PEGAWAI` **selalu ditambahkan otomatis** oleh server meski tidak disertakan dalam request — tidak bisa dihapus. Role `SUPERADMIN` hanya bisa diberikan/dicabut oleh `SUPERADMIN`.

### Manajemen Sesi Login `[Web]`

#### `GET /api/v1/admin/users/:userId/sessions`
Melihat sesi aktif milik pegawai, termasuk `deviceLabel` dan `lastActiveAt`.

#### `POST /api/v1/admin/users/:userId/sessions/:sessionId/revoke`
Paksa sign-out sesi (`status → REVOKED`). Dipakai saat pegawai kehilangan device atau perlu login di device baru.

---

## 8. Format Error (konsisten di semua endpoint)
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

Kode error yang mungkin:

| Kode | HTTP | Keterangan |
|---|---|---|
| `UNAUTHORIZED` | 401 | Token tidak disertakan atau tidak valid |
| `SESSION_REVOKED` | 401 | Sesi telah dicabut oleh admin atau sign-out |
| `SESSION_ALREADY_ACTIVE` | 409 | Login ditolak karena sesi di device lain masih aktif |
| `FORBIDDEN` | 403 | Role tidak memiliki akses ke endpoint ini |
| `NOT_FOUND` | 404 | Resource tidak ditemukan |
| `VALIDATION_ERROR` | 422 | Input tidak valid (detail di `details`) |
| `QUOTA_EXCEEDED` | 422 | Sisa kuota cuti tidak mencukupi |
| `INVALID_APPROVAL_STATE` | 422 | Operasi tidak valid untuk status pengajuan saat ini |
| `INTEGRATION_ERROR` | 502 | Gagal mengirim data ke sistem lama |
| `TOO_MANY_REQUESTS` | 429 | Rate limit — berlaku untuk login, refresh, dan upload |
