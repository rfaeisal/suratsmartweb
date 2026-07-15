# CutiSmart — Web (Next.js) — Spesifikasi API

API ini dikonsumsi oleh dua klien: web UI (Next.js sendiri, via Server Actions/internal fetch) dan **Flutter app** (via REST, JSON, Bearer token). Base path: `/api/v1`.

## 1. Autentikasi (SSO ke Sistem Lama) & Sesi Login

Mobile app (Flutter) memakai **sesi persisten**: sekali login, token disimpan di device dan dipakai untuk auto-login setiap kali app dibuka — pegawai tidak perlu login ulang setiap saat. Sesi **tidak punya masa kedaluwarsa otomatis**, hanya berakhir bila di-*sign out* (oleh pegawai sendiri atau dipaksa oleh admin kepegawaian). Untuk mencegah satu akun terbuka di banyak device sekaligus, **hanya boleh ada satu sesi aktif per akun** — percobaan login di device lain saat sesi masih aktif akan **ditolak**.

### `POST /api/v1/auth/login`
Body:
```json
{ "username": "string", "password": "string", "deviceId": "string", "deviceLabel": "string (opsional, mis. model HP)" }
```
Alur internal:
1. Next.js memanggil endpoint SSO di sistem lama (lihat `05-INTEGRASI-SISTEM-LAMA.md`) untuk validasi kredensial.
2. Jika valid, Next.js mengambil/menyinkron data pegawai terkait dari sistem lama ke tabel `Employee` lokal.
3. **Cek sesi aktif**: jika `AppUser` ini sudah punya `UserSession` berstatus `ACTIVE` (dari device/login sebelumnya), login **ditolak** dengan error `SESSION_ALREADY_ACTIVE` (lihat contoh di bawah) — kecuali `deviceId` yang mencoba login sama persis dengan sesi aktif tersebut (re-login dari device yang sama diperbolehkan).
4. Jika tidak ada sesi aktif lain, Next.js membuat `UserSession` baru dan menerbitkan **access token (JWT, umur pendek, mis. 1 jam)** + **refresh token (umur panjang/tanpa kedaluwarsa, disimpan ter-hash di `UserSession.refreshTokenHash`)**.

Response sukses:
```json
{
  "accessToken": "jwt...",
  "refreshToken": "opaque-token...",
  "user": {
    "id": "...", "nip": "...", "fullName": "...",
    "employeeType": "PNS",
    "roles": ["PEGAWAI"],
    "unit": { "id": "...", "name": "..." }
  }
}
```
> **Catatan**: `roles` adalah array — satu user bisa punya lebih dari satu role sekaligus (mis. `["PEGAWAI", "APPROVER"]`). Klien harus menampilkan UI untuk **semua** role yang dimiliki user secara bersamaan.
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
> Jika ini terjadi, pegawai perlu logout dari device lama, atau meminta admin kepegawaian mencabut (revoke) sesi lama melalui admin panel.

### `POST /api/v1/auth/refresh`
Body: `{ "refreshToken": "..." }` — dipanggil mobile app secara berkala/otomatis untuk mendapatkan access token baru selama sesi masih `ACTIVE`. Jika sesi sudah di-*revoke* (mis. oleh admin), mengembalikan `401 SESSION_REVOKED` — mobile app harus menghapus token tersimpan & menampilkan layar login.

### `GET /api/v1/auth/me`
Dipanggil mobile app saat pertama dibuka (menggunakan access token tersimpan) untuk **auto-login**: memvalidasi sesi masih `ACTIVE` sekaligus mengambil data user terbaru. Jika sesi revoked/invalid → `401`, app menampilkan layar login.
Response: `{ id, nip, fullName, employeeType, roles: string[], unit: { id, name } }`

### `POST /api/v1/auth/logout`
Mencabut (`REVOKED`) `UserSession` milik device yang sedang login (`revokedBy: "SELF"`), serta menghapus token FCM terkait device tersebut.

### `POST /api/v1/auth/fcm-token`
Body: `{ "token": "fcm_device_token" }` — daftarkan token FCM device untuk push notification.

> **Keputusan**: kebijakan "satu sesi aktif" di atas berlaku khusus untuk mobile app (karena sesinya persisten/tanpa kedaluwarsa). Web app tetap login seperti biasa memakai sesi browser terpisah via NextAuth (bukan `UserSession` tanpa kedaluwarsa) — sehingga pegawai bisa login web dan mobile bersamaan tanpa saling menolak, dan login web tidak dibatasi satu device/browser saja.

Semua endpoint di bawah ini butuh header `Authorization: Bearer <accessToken>`.

## 2. Master Data (read-only untuk pegawai/approver)

### `GET /api/v1/leave-types`
Mengembalikan jenis cuti yang berlaku untuk `employeeType` user yang sedang login, beserta sisa kuota tahun berjalan.
```json
[
  { "id": "...", "code": "CUTI_TAHUNAN", "name": "Cuti Tahunan", "requiresAttachment": false, "remainingDays": 8 },
  { "id": "...", "code": "CUTI_SAKIT", "name": "Cuti Sakit", "requiresAttachment": false, "remainingDays": null }
]
```

### `GET /api/v1/units/:unitId/employees`
Daftar pegawai satu unit (untuk memilih delegasi/pengganti).

## 3. Pengajuan Cuti (Pegawai)

### `POST /api/v1/leave-requests`
```json
{
  "leaveTypeId": "...",
  "startDate": "2026-08-01",
  "endDate": "2026-08-05",
  "reason": "string",
  "delegateEmployeeId": "...",
  "attachmentFileIds": ["..."]
}
```
Response: objek `LeaveRequest` status `SUBMITTED`.

### `GET /api/v1/leave-requests?status=&mine=true`
List pengajuan milik user (untuk monitoring pegawai).

### `GET /api/v1/leave-requests/:id`
Detail pengajuan termasuk `approvalSteps[]`, status tiap tahap, dan link SK (jika sudah terbit).

### `POST /api/v1/attachments` (multipart/form-data)
Upload lampiran opsional, mengembalikan `fileId` untuk direferensikan saat create leave request.

## 4. Konfirmasi Delegasi/Pengganti

Sebelum admin kepegawaian bisa memproses suatu pengajuan, pegawai yang ditunjuk sebagai pengganti harus mengonfirmasi kesediaannya.

### `GET /api/v1/delegate-confirmations/inbox`
Daftar pengajuan di mana user yang login ditunjuk sebagai delegasi/pengganti dan berstatus `PENDING`.

### `POST /api/v1/delegate-confirmations/:leaveRequestId/decision`
```json
{ "decision": "CONFIRMED", "note": "string (wajib jika DECLINED)" }
```
`decision`: `CONFIRMED` | `DECLINED`.
Efek:
- `CONFIRMED` → `LeaveRequest.status` berubah dari `SUBMITTED` menjadi `PENDING_ADMIN_REVIEW`, muncul di antrean admin kepegawaian.
- `DECLINED` → `LeaveRequest.status` menjadi `DELEGATE_DECLINED`, notifikasi ke pegawai pengaju agar memilih pengganti lain dan submit ulang.

## 5. Approval (Atasan/Kepala Bagian/Wakil Direktur)

> Semua tahap approval (Atasan Langsung, Kepala Bagian/Bidang, hingga Wakil Direktur) memakai endpoint yang sama ini dan **sepenuhnya bisa dilakukan dari app Flutter maupun web** — tidak ada tahap yang dibatasi hanya di satu klien.

### `GET /api/v1/approvals/inbox`
Daftar pengajuan yang menunggu approval dari user yang login (step `PENDING` di mana `approverId == currentUser`).

### `POST /api/v1/approvals/:approvalStepId/decision`
```json
{ "decision": "APPROVED", "note": "string (opsional)" }
```
`decision`: `APPROVED` | `REJECTED` | `RETURNED`.
Efek:
- Jika `APPROVED` dan masih ada tahap berikutnya → status `LeaveRequest` tetap `IN_APPROVAL`, notifikasi ke approver tahap berikutnya.
- Jika `APPROVED` dan itu tahap terakhir → status `APPROVED`, sistem generate SK (job async), lalu kirim ke sistem lama.
- Jika `REJECTED`/`RETURNED` → status `LeaveRequest` ikut berubah (`REJECTED`/`RETURNED`), notifikasi ke pegawai.

## 6. Admin Kepegawaian

### `POST /api/v1/admin/leave-requests/:id/approval-flow`
Menetapkan/menyusun ulang alur approval untuk suatu pengajuan. **Hanya bisa dipanggil jika `delegateConfirmationStatus = CONFIRMED`** (status pengajuan `PENDING_ADMIN_REVIEW`) — jika delegasi belum konfirmasi, endpoint ini mengembalikan error `INVALID_APPROVAL_STATE`.
```json
{
  "steps": [
    { "stepOrder": 1, "approverEmployeeId": "...", "roleLabel": "Atasan Langsung" },
    { "stepOrder": 2, "approverEmployeeId": "...", "roleLabel": "Kepala Bagian" },
    { "stepOrder": 3, "approverEmployeeId": "...", "roleLabel": "Wakil Direktur" }
  ]
}
```
Setelah endpoint ini dipanggil, status `LeaveRequest` berubah menjadi `IN_APPROVAL` dan notifikasi terkirim ke approver tahap 1.

### `GET /api/v1/admin/leave-requests`
List semua pengajuan (filter: status, unit, jenis cuti, rentang tanggal) untuk monitoring.

### `POST /api/v1/admin/integration-logs/:id/retry`
Memicu ulang pengiriman (kirim ulang manual) data cuti ke sistem lama untuk log yang berstatus `FAILED`, dipakai admin kepegawaian saat status pengajuan `SEND_FAILED`.

### `GET /api/v1/admin/leave-requests/:id/sk/print`
Mengembalikan file PDF SK untuk dicetak langsung dari admin panel (sama dokumennya dengan `GET /leave-requests/:id/sk`, endpoint terpisah ini disediakan agar admin panel punya aksi "Cetak SK" yang eksplisit, mis. langsung memicu print dialog di browser).

### `GET /api/v1/admin/reports/leave-recap`
Rekapan cuti untuk periode tertentu.
Query params: `startDate`, `endDate`, `unitId` (opsional), `employeeType` (opsional), `leaveTypeId` (opsional).
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
Dipakai untuk fitur rekap cuti periode tertentu di admin panel (bisa diekspor ke Excel/PDF sebagai pengembangan lanjutan).

### CRUD Master Data
- `GET/POST/PUT /api/v1/admin/leave-types`
- `GET/POST/PUT /api/v1/admin/leave-quotas`
- `GET/POST/PUT /api/v1/admin/units`

### Manajemen Role Pengguna

### `GET /api/v1/admin/users/:id/roles`
Melihat roles yang dimiliki seorang user (respons: `{ id, roles: string[], employee: { fullName, nip } }`).

### `PUT /api/v1/admin/users/:id/roles`
Mengubah roles user (replace semua). Body: `{ "roles": ["PEGAWAI", "APPROVER"] }`. Minimal 1 role wajib diisi. Role `SUPERADMIN` hanya bisa diberikan/dicabut oleh `SUPERADMIN`.
```json
{ "roles": ["PEGAWAI", "APPROVER"] }
```

### Manajemen Sesi Login (Force Sign-out)

### `GET /api/v1/admin/users/:userId/sessions`
Melihat sesi (biasanya satu, karena kebijakan satu sesi aktif) milik seorang pegawai, termasuk `deviceLabel` dan `lastActiveAt`.

### `POST /api/v1/admin/users/:userId/sessions/:sessionId/revoke`
Memaksa sign-out sesi tersebut (`status → REVOKED`, `revokedBy` diisi id admin). Dipakai saat pegawai kehilangan device atau perlu login di device baru padahal sesi lama masih terkunci aktif.

## 7. Dokumen SK

### `GET /api/v1/leave-requests/:id/sk` 
Mengembalikan metadata + URL unduh PDF SK (setelah status `APPROVED`/`SENT_TO_LEGACY`).

## 8. Error Format (konsisten di semua endpoint)
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```
Kode umum: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `QUOTA_EXCEEDED`, `INVALID_APPROVAL_STATE`, `INTEGRATION_ERROR`, `TOO_MANY_REQUESTS` (429 — rate limit login/refresh/upload).
