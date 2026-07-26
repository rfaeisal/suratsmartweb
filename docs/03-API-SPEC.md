# CutiSmart — Spesifikasi API

Base path: `/api/v1`

API ini dikonsumsi oleh dua klien:
- **Flutter (mobile)** — via REST + Bearer token. Scope: pengajuan cuti, konfirmasi delegasi, approval, absensi (scan QR), riwayat absensi, permintaan tukar shift, dan approval tukar shift (untuk KEPALA_UNIT).
- **Web admin panel** — via fetch internal (NextAuth session cookie). Scope penuh: seluruh fitur admin kepegawaian, manajemen roster, lembur, laporan, dan semua fitur KEPALA_UNIT/ADMIN_UNIT.

Setiap endpoint di bawah diberi label **`[Mobile]`** atau **`[Web]`** untuk memperjelas klien mana yang menggunakannya. Endpoint berlabel **`[Mobile]`** juga bisa dipanggil dari web (shared endpoint), sedangkan **`[Web]`** adalah eksklusif admin panel.

---

## Ringkasan Endpoint Mobile (Flutter)

Hanya endpoint berikut yang perlu diimplementasikan di sisi Flutter:

| Kelompok | Endpoint |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout` |
| FCM & device | `POST /devices/register-token`, `DELETE /devices/register-token` |
| Master data | `GET /leave-types`, `GET /units/:unitId/employees`, `GET /employees/search` |
| Pengajuan cuti | `POST /attachments`, `POST /leave-requests`, `GET /leave-requests`, `GET /leave-requests/:id` (termasuk skDocument) |
| Konfirmasi delegasi | `GET /delegate-confirmations/inbox`, `POST /delegate-confirmations/:id/decision` |
| Approval | `GET /approvals/inbox`, `POST /approvals/:stepId/decision` |
| Profil | `POST /profile/avatar`, `DELETE /profile/avatar` |
| Absensi | `POST /attendance` (scan QR), `GET /attendance/me` |
| Roster | `GET /rosters?employee_id=` (lihat roster sendiri/rekan) |
| Lembur | `GET /overtime`, `POST /overtime` |
| Tukar shift | `GET /shift-swaps`, `POST /shift-swaps`, `POST /shift-swaps/:id/accept`, `POST /shift-swaps/:id/reject`, `POST /shift-swaps/:id/approve` *(KEPALA_UNIT)* |

Semua endpoint admin (`/admin/*`), lembur, manajemen roster, dan manajemen sesi/role adalah **web-only** dan tidak perlu diintegrasikan di Flutter.

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

> **`roles` adalah array** — satu user bisa punya lebih dari satu role sekaligus. Role yang mungkin: `PEGAWAI`, `APPROVER`, `KEPALA_UNIT`, `ADMIN_UNIT`, `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`. Role `PEGAWAI` **selalu ada** di setiap akun dan tidak bisa dihapus. Flutter harus menampilkan UI untuk **semua** role yang dimiliki (mis. tab "Pengajuan Saya" + tab "Inbox Approval" + tab "Lembur" sekaligus). Role `KEPALA_UNIT` dan `ADMIN_UNIT` mendapat akses ke fitur absensi unit yang dikelola.

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

> **Alur login yang benar (Flutter):**
> 1. `POST /auth/login` → simpan `accessToken` + `refreshToken`
> 2. **`POST /devices/register-token`** → kirim FCM token + `deviceId` *(langkah ini wajib; lihat Seksi 6)*
> 3. `GET /auth/me` → load data user terbaru

### `POST /api/v1/auth/fcm-token` `[Mobile]` *(deprecated)*
Body: `{ "token": "fcm_device_token" }` — daftarkan token FCM device. **Gunakan `/devices/register-token` untuk client baru** — endpoint ini dipertahankan untuk kompatibilitas mundur.

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
Upload lampiran sebelum submit pengajuan (step 1 dari 2-step flow). Mengembalikan `{ "fileId": "..." }` yang direferensikan di `attachmentFileIds` saat POST leave-request. File dipindahkan ke lokasi final saat pengajuan dibuat.
File yang diizinkan: PDF, JPG, PNG. **Maks 2 MB per file.**

### `POST /api/v1/leave-requests` `[Mobile]`
```json
{
  "leaveTypeId": "...",
  "startDate": "2026-08-01",
  "endDate": "2026-08-05",
  "reason": "string (min. 5 karakter)",
  "addressDuringLeave": "string (opsional, min. 5 karakter) — alamat tinggal selama cuti",
  "emergencyPhone": "string (opsional, maks. 20 karakter) — nomor HP darurat selama cuti",
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
Detail lengkap pengajuan: data pengaju, jenis cuti, tanggal, alasan, `addressDuringLeave`, `emergencyPhone`, pegawai pengganti, status konfirmasi delegasi, `approvalSteps[]` (beserta status tiap tahap), dan `skDocument` (nomor SK, filePath, generatedAt) jika sudah terbit. **Info SK sudah termasuk di response ini — tidak ada endpoint `/sk` terpisah untuk mobile.**

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

---

## 6. Manajemen Device & Profil `[Mobile]`

### `POST /api/v1/devices/register-token` `[Mobile]`
Daftarkan atau perbarui token FCM untuk device tertentu.

> **Wajib dipanggil segera setelah `POST /auth/login` berhasil** (dan setiap kali Firebase menghasilkan token baru via `onTokenRefresh`). Tanpa ini, tabel `FcmToken` kosong dan **tidak ada notifikasi push yang akan sampai ke device**, meski Firebase sudah dikonfigurasi dengan benar di server.

Body: `{ "fcmToken": "string", "deviceId": "string" }`
Response: `{ "message": "Token registered" }`

### `DELETE /api/v1/devices/register-token` `[Mobile]`
Hapus token FCM device. Dipanggil saat logout manual.
Body: `{ "deviceId": "string" }`

### `POST /api/v1/profile/avatar` (multipart/form-data) `[Mobile]`
Upload atau ganti foto profil pegawai. File: JPG/PNG, maks 2 MB.
Response: `{ "avatarUrl": "string" }`

### `DELETE /api/v1/profile/avatar` `[Mobile]`
Hapus foto profil.

### `GET /api/v1/profile/avatar/file` `[Mobile]`
Mengunduh file avatar langsung (digunakan untuk local storage mode, bukan Vercel Blob).
Query param: `path` — path file yang di-encode.

---

## 7. Admin Kepegawaian `[Web]`

Seluruh endpoint di bawah ini adalah **web-only** dan tidak digunakan oleh Flutter.

### `POST /api/v1/admin/leave-requests/:id/approval-flow` `[Web]`
Menetapkan atau menyusun ulang alur approval. **Hanya bisa dipanggil saat status `PENDING_ADMIN_REVIEW`** (delegasi sudah konfirmasi, dan kepala ruangan sudah approve jika ada) — jika tidak, mengembalikan `INVALID_APPROVAL_STATE`.
```json
{
  "steps": [
    { "employeeId": "...", "roleLabel": "Atasan Langsung" },
    { "employeeId": "...", "roleLabel": "Kepala Bagian TU" },
    { "employeeId": "..." }
  ]
}
```
`stepOrder` tidak perlu disertakan — dihitung otomatis oleh server mulai setelah step yang sudah `APPROVED` (mis. step kepala ruangan). Setelah dipanggil, status pengajuan berubah ke `IN_APPROVAL` dan notifikasi dikirim ke approver tahap pertama.

### `GET /api/v1/admin/leave-requests` `[Web]`
List semua pengajuan dengan filter: `status`, `unitId`, `leaveTypeId`, rentang tanggal.

### `GET /api/v1/admin/leave-requests/:id/sk/download` `[Web]`
Download atau cetak ulang file PDF SK dari admin panel. Tersedia selama SK sudah digenerate (status `APPROVED` ke atas).

### `POST /api/v1/admin/leave-requests/:id/generate-sk` `[Web]`
Generate ulang SK PDF secara manual (misalnya jika file sebelumnya rusak atau format berubah).

### `POST /api/v1/admin/leave-requests/:id/send-to-legacy` `[Web]`
Kirim ulang manual data cuti ke sistem lama. Digunakan saat status pengajuan `SEND_FAILED`. Membuat `IntegrationLog` baru dan update status ke `SENT_TO_LEGACY` jika berhasil.

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
- `GET/POST /api/v1/admin/leave-types`, `GET/PUT /api/v1/admin/leave-types/:id`
- `GET/POST /api/v1/admin/leave-quotas`, `GET/PUT /api/v1/admin/leave-quotas/:id`
- `GET/POST /api/v1/admin/units`, `GET/PUT/DELETE /api/v1/admin/units/:id`
- `GET/POST /api/v1/admin/positions`, `PUT/DELETE /api/v1/admin/positions/:id`
- `GET /api/v1/admin/employees`, `PUT /api/v1/admin/employees/:id`
- `GET/POST /api/v1/admin/sync/employees` — sinkronisasi massal pegawai dari sistem lama
- `GET/PUT /api/v1/admin/settings` — baca/tulis konfigurasi aplikasi (`AppSetting`)
- `GET /api/v1/admin/reports/export` — export rekap cuti

### Pencarian Pegawai `[Mobile/Web]`

#### `GET /api/v1/employees/search`
Pencarian pegawai by nama/NIP (dipakai dropdown pilih approver atau delegasi).
Query param: `q` — keyword pencarian.

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
| `SESSION_ALREADY_ACTIVE` | 409 | Login ditolak karena sesi di device lain masih aktif (berlaku hanya jika `enforce_single_session=true` di AppSetting) |
| `FORBIDDEN` | 403 | Role tidak memiliki akses ke endpoint ini |
| `NOT_FOUND` | 404 | Resource tidak ditemukan |
| `VALIDATION_ERROR` | 422 | Input tidak valid (detail di `details`) |
| `QUOTA_EXCEEDED` | 422 | Sisa kuota cuti tidak mencukupi |
| `INVALID_APPROVAL_STATE` | 422 | Operasi tidak valid untuk status pengajuan saat ini |
| `INTEGRATION_ERROR` | 502 | Gagal mengirim data ke sistem lama |
| `TOO_MANY_REQUESTS` | 429 | Rate limit — berlaku untuk login, refresh, dan upload |

---

## 9. Modul Absensi `[Mobile & Web]`

> Semua endpoint absensi memerlukan JWT Bearer token. Mobile menggunakan token login yang sama dengan modul cuti.

### Perangkat & Ruangan

#### `GET /api/v1/rooms`
Daftar ruangan. Query: `work_unit_id`.

#### `POST /api/v1/rooms`
Buat ruangan baru. Role: `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`.
```json
{ "nama": "string", "work_unit_id": "string" }
```

#### `PATCH /api/v1/rooms/:id`
Update ruangan.

#### `GET /api/v1/devices`
Daftar perangkat ESP32. Role: `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`.

#### `POST /api/v1/devices`
Provisioning perangkat baru. Mengembalikan `device_id` dan `secret` **sekali** saja.
```json
{ "nama": "string", "room_id": "string?", "ibeacon_uuid": "string", "ibeacon_major": number, "ibeacon_minor": number }
```
Response:
```json
{ "id": "...", "device_id": "abc123...", "secret": "...", "status": "ACTIVE" }
```

#### `PATCH /api/v1/devices/:id`
Update perangkat (status, room, label).

### Shift & Roster

#### `GET /api/v1/shifts`
Daftar shift. Query: `work_unit_id`, `active`.

#### `POST /api/v1/shifts`
Buat shift baru. Role: `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`.
```json
{ "nama": "string", "type": "ROTASI|TETAP", "start_time": "HH:MM", "end_time": "HH:MM", "work_days": [1,2,3,4,5] }
```

#### `PATCH /api/v1/shifts/:id`
Update shift (nama, active). Role: `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`.

#### `DELETE /api/v1/shifts/:id`
Hapus shift (diblokir jika dipakai di roster aktif).

#### `GET /api/v1/shifts/:id/units`
Unit kerja yang menggunakan shift ini.

#### `POST /api/v1/shifts/:id/units`
Tambah unit ke shift. Body: `{ "work_unit_id": "string" }`.

#### `DELETE /api/v1/shifts/:id/units/:unitId`
Hapus mapping unit dari shift.

#### `GET /api/v1/public-holidays`
Daftar libur nasional. Query: `year`.

#### `POST /api/v1/public-holidays`
Tambah libur nasional. Body: `{ "date": "YYYY-MM-DD", "nama": "string" }`.

#### `DELETE /api/v1/public-holidays/:id`

#### `GET /api/v1/roster-periods`
Daftar periode roster. Query: `work_unit_id`, `year`, `month`.

#### `POST /api/v1/roster-periods`
Buat periode roster. Body: `{ "work_unit_id": "string", "year": number, "month": number }`.

#### `POST /api/v1/roster-periods/:id/submit`
`ADMIN_UNIT` mengajukan roster untuk disetujui kepala unit. Status: `DRAFT` → `PENDING_APPROVAL`.

#### `POST /api/v1/roster-periods/:id/return`
Kembalikan roster ke DRAFT (oleh `ADMIN_UNIT` untuk menarik pengajuan, atau `KEPALA_UNIT` untuk mengembalikan). Status: `PENDING_APPROVAL` → `DRAFT`.

#### `POST /api/v1/roster-periods/:id/publish`
Publikasikan roster. Role: `KEPALA_UNIT`, `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`. Status: `DRAFT`/`PENDING_APPROVAL` → `PUBLISHED`.

#### `POST /api/v1/roster-periods/:id/unpublish`
Batalkan publikasi roster (kembalikan ke DRAFT). Role: `KEPALA_UNIT`, `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`.

#### `GET /api/v1/rosters`
Daftar entri roster. Dua mode filter (salah satu wajib):
- `period_id` — semua roster dalam periode (role: `KEPALA_UNIT`, `ADMIN_UNIT`, admin)
- `employee_id` — roster mendatang milik pegawai tertentu; pemanggil harus satu unit dengan target (bisa dipakai pegawai biasa untuk lihat roster rekan saat ajukan tukar shift)

#### `POST /api/v1/rosters`
Tambah entri roster manual.
```json
{ "employee_id": "string", "period_id": "string", "shift_id": "string", "tanggal_kerja": "YYYY-MM-DD" }
```

#### `PATCH /api/v1/rosters/:id`
Ubah shift untuk entri roster tertentu. Body: `{ "shift_id": "string" }`.

#### `DELETE /api/v1/rosters/:id`

#### `POST /api/v1/rosters/generate`
Auto-generate roster dari shift tetap untuk periode. Role: `KEPALA_UNIT`, `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`.
```json
{ "period_id": "string", "employee_id": "string (opsional)" }
```
Jika `employee_id` disertakan, generate hanya untuk pegawai tersebut (jadwalnya harus kosong). Tanggal yang sudah terisi dilewati (`skipped`). Shift TETAP berlaku untuk semua unit tanpa perlu mapping.

Response: `{ "created": number, "skipped": number, "period_id": "string" }`

### Utility (Development)

> Semua endpoint di bawah ini **hanya aktif saat `LEGACY_SSO_MOCK=true`**. Di production akan mengembalikan 404. Tidak memerlukan autentikasi.

#### `GET /api/v1/dev/qr-token?device_id=DEV-MOCK-001`
Generate token QR teks untuk pengujian tanpa perangkat ESP32 fisik.
Response: `{ "token": "deviceId|counter|hmac", "counter": "string", "expires_in_sec": 30 }`

#### `GET /api/v1/dev/qr-image?device_id=DEV-MOCK-001`
Generate QR code sebagai gambar PNG siap-scan. Header response menyertakan:
- `X-Token` — nilai token (sama seperti `qr-token`)
- `X-Expires-In` — sisa detik sebelum token expire
- `X-Interval` — interval rotasi token (detik)

Dipakai oleh halaman dev tools `/dev/attendance-qr` untuk menampilkan QR visual.

#### `GET /api/v1/dev/attendance-log?limit=50`
Daftar record absensi terbaru (maks 200). Dipakai oleh halaman `/dev/attendance-log`.
Response: `{ "data": [{ "id", "fullName", "nip", "eventType", "recordedAt", "tanggalKerja", "room", "status", "telat", "beaconDetected", "flags" }] }`

**Halaman Dev Tools (web):**
- `/dev/attendance-qr` — Tampilkan QR code visual, auto-refresh saat ada scan baru (~2 detik), notifikasi scan berhasil
- `/dev/attendance-log` — Log absensi realtime, auto-refresh setiap 2 detik, highlight record baru

**Mock device yang tersedia di seed:**
- `DEV-MOCK-001` — Perangkat Mock Dev, Ruang Mock Dev, Unit Bagian Umum (U01)

### Job Terjadwal

> Semua job endpoint hanya bisa dipanggil dengan role `SUPERADMIN`. Dimaksudkan untuk dipanggil oleh cron job server, bukan dari Flutter.

#### `POST /api/v1/jobs/mark-alpha`
Tandai pegawai yang tidak absen sebagai Alpha untuk tanggal kemarin. Dipanggil cron harian setelah tengah malam.
Body: `{ "days_back": 1 }` (opsional). Response: `{ "marked": number, "skipped": number }`.

#### `POST /api/v1/jobs/leave-reminders`
Kirim push notif pengingat cuti ke pegawai yang cuti-nya dimulai besok atau berakhir hari ini (status `APPROVED`).
Dipanggil cron harian, disarankan pagi hari (mis. 06.00 WIB).
Response: `{ "startingTomorrow": number, "endingToday": number }`.

#### `POST /api/v1/jobs/attendance-reminders`
Kirim push notif pengingat absen ke pegawai yang belum absen masuk atau belum absen pulang sesuai jadwal shift.
Body: `{ "grace_minutes": 30 }` (opsional, default 30). Dipanggil cron setiap jam.
Response: `{ "checkinNotified": number, "checkoutNotified": number }`.

### Absensi (Scan QR)

#### `POST /api/v1/attendance` `[Mobile]`
Rekam kehadiran via scan QR dari perangkat ESP32.
```json
{
  "qr_token": "deviceId|counter|hmac",
  "event_type": "masuk|pulang|lembur_masuk|lembur_pulang",
  "beacon": { "detected": true, "uuid": "string?", "major": 0, "minor": 0 },
  "client_time": "ISO string"
}
```
Response 201:
```json
{
  "attendance_id": "...",
  "event_type": "masuk",
  "recorded_at": "ISO",
  "tanggal_kerja": "ISO",
  "status": "VALID",
  "telat": false,
  "flags": []
}
```

**Catatan perilaku:**
- **Beacon**: Wajib `detected: true` di production. Di dev mode (`LEGACY_SSO_MOCK=true`), nilai ini diabaikan dan server menyimpan `beaconDetected: false`. Tim mobile sebaiknya kirim `detected: false` di dev mode.
- **Roster**: Jika pegawai tidak punya roster hari itu (misal tukar shift belum disetujui), absensi tetap direkam dengan `tanggal_kerja` = tanggal kalender WIB dan flag `"no_roster"`. Kalkulasi keterlambatan tidak dilakukan.
- **Flag `no_roster`**: Menandakan absensi masuk tanpa roster — perlu rekonsiliasi manual setelah tukar shift disetujui.

#### `GET /api/v1/attendance/me` `[Mobile]`
Riwayat absensi pegawai sendiri. Query: `from`, `to` (YYYY-MM-DD, wajib).
Response: `{ "data": [AttendanceRecord], "summary": { "hadir": number, "alpha": number, "terlambat": number } }`

#### `GET /api/v1/attendance` `[Web]`
Daftar absensi semua pegawai (admin). Query: `work_unit_id`, `from`, `to`, `employee_id`, `status`.

### Lembur

#### `GET /api/v1/overtime`
Daftar lembur. Query: `status`, `work_unit_id`.
- `PEGAWAI` → hanya milik sendiri
- `KEPALA_UNIT` → hanya unit yang dikelola
- `ADMIN_KEPEGAWAIAN`/`SUPERADMIN` → semua (atau filter `work_unit_id`)

#### `POST /api/v1/overtime` `[Mobile]`
Ajukan lembur. Role: `PEGAWAI`.
```json
{ "tanggal_kerja": "YYYY-MM-DD", "note": "string?" }
```

#### `POST /api/v1/overtime/:id/approve-unit`
Setujui lembur oleh kepala unit. Role: `KEPALA_UNIT`.
Status: `DIAJUKAN` → `DISETUJUI_UNIT`.

#### `POST /api/v1/overtime/:id/approve-hr`
Sahkan lembur oleh HR. Role: `ADMIN_KEPEGAWAIAN`.
Status: `DISETUJUI_UNIT` → `SAH`.

#### `POST /api/v1/overtime/:id/reject`
Tolak lembur. Role: `KEPALA_UNIT` atau `ADMIN_KEPEGAWAIAN`.

### Tukar Shift

#### `GET /api/v1/shift-swaps`
Daftar permintaan tukar shift. Query: `status`, `work_unit_id`.

#### `POST /api/v1/shift-swaps` `[Mobile]`
Ajukan tukar shift. Role: `PEGAWAI`.
```json
{ "requester_roster_id": "string", "target_roster_id": "string", "alasan": "string?" }
```
Status awal: `MENUNGGU_TARGET`.

#### `POST /api/v1/shift-swaps/:id/accept` `[Mobile]`
Pegawai tujuan setuju. Role: pegawai target.
Status: `MENUNGGU_TARGET` → `MENUNGGU_KEPALA`.

#### `POST /api/v1/shift-swaps/:id/reject` `[Mobile/Web]`
Pegawai tujuan atau kepala unit tolak.

#### `POST /api/v1/shift-swaps/:id/approve` `[Mobile]`
Kepala unit setujui → tukar shift di roster dieksekusi. Role: `KEPALA_UNIT`.
Status: `MENUNGGU_KEPALA` → `DISETUJUI`.

### Laporan Absensi

#### `GET /api/v1/admin/attendance/reports`
Rekap absensi. Role: `KEPALA_UNIT` (unit sendiri), `ADMIN_KEPEGAWAIAN`, `SUPERADMIN`.
Query:
| Parameter | Keterangan |
|---|---|
| `from` | YYYY-MM-DD (wajib) |
| `to` | YYYY-MM-DD (wajib) |
| `work_unit_id` | Filter unit (opsional; KEPALA_UNIT dikunci ke unitnya) |
| `format` | `json` (default) / `xlsx` / `pdf` |

Response JSON: `{ "title": "...", "total": 0, "data": [AttendanceRow] }`
Response XLSX/PDF: file download.

### Error Codes Tambahan (Absensi)

| Kode | HTTP | Keterangan |
|---|---|---|
| `DEVICE_CONFLICT` | 409 | Login ditolak: akun sudah aktif di perangkat lain |
| `DEVICE_BINDING_REQUIRED` | 422 | Device ID wajib disertakan di request login mobile |
| `QR_INVALID` | 422 | Token QR tidak valid (format/HMAC salah) |
| `QR_EXPIRED` | 422 | Token QR sudah kedaluwarsa (counter terlalu lama) |
| `QR_REPLAYED` | 422 | Token QR sudah pernah dipakai (replay attack) |
| `BEACON_TIDAK_TERDETEKSI` | 422 | BLE beacon tidak terdeteksi (pegawai tidak ada di lokasi) |
| `NO_ROSTER` | 422 | Tidak ada roster aktif untuk pegawai di tanggal ini |

---

## 10. Push Notification (FCM) `[Mobile]`

Semua notifikasi dikirim sebagai **FCM data-only message** (bukan notification message). Flutter bertanggung jawab menampilkan notifikasi dan melakukan routing berdasarkan field `type`.

Token FCM didaftarkan via `POST /api/v1/devices/register-token` setelah login.

### Struktur Umum

Setiap pesan FCM memiliki field `type` sebagai discriminator utama, ditambah field spesifik per tipe.

---

### Tipe: `STATUS_CHANGE` — Perubahan status pengajuan cuti

Dikirim ke **pegawai pengaju**.

| Field | Nilai | Keterangan |
|---|---|---|
| `type` | `"STATUS_CHANGE"` | |
| `newStatus` | `"APPROVED"` / `"REJECTED"` / `"RETURNED"` / `"DELEGATE_DECLINED"` / `"SEND_FAILED"` | |
| `title` | string | Judul notifikasi |
| `body` | string | Isi notifikasi |
| `leaveRequestId` | string | ID pengajuan cuti |
| `requestNumber` | string | Nomor pengajuan (mis. `CU/2026/001`) |

**Skenario pengiriman:**
- `APPROVED` — semua approver telah menyetujui (final)
- `REJECTED` — salah satu approver menolak
- `RETURNED` — pengajuan dikembalikan untuk revisi
- `DELEGATE_DECLINED` — pegawai pengganti menolak konfirmasi delegasi

---

### Tipe: `DELEGATE_REQUEST` — Permintaan konfirmasi delegasi

Dikirim ke **pegawai yang ditunjuk sebagai pengganti**.

| Field | Nilai | Keterangan |
|---|---|---|
| `type` | `"DELEGATE_REQUEST"` | |
| `title` | string | |
| `body` | string | |
| `leaveRequestId` | string | |
| `requestNumber` | string | |
| `requesterName` | string | Nama pegawai pengaju |
| `leaveType` | string | Nama jenis cuti |
| `startDate` | string | Tanggal mulai cuti |
| `endDate` | string | Tanggal selesai cuti |

**Aksi mobile:** tampilkan form konfirmasi → `POST /delegate-confirmations/:id/decision`

---

### Tipe: `APPROVAL_NEEDED` — Pengajuan cuti menunggu persetujuan

Dikirim ke **approver** yang mendapat giliran menyetujui.

| Field | Nilai | Keterangan |
|---|---|---|
| `type` | `"APPROVAL_NEEDED"` | |
| `title` | string | |
| `body` | string | |
| `leaveRequestId` | string | |
| `requestNumber` | string | |
| `requesterName` | string | |

**Aksi mobile:** buka inbox approval → `GET /approvals/inbox`

---

### Tipe: `LEAVE_REMINDER` — Pengingat cuti

Dikirim ke **pegawai pengaju** oleh job terjadwal harian.

| Field | Nilai | Keterangan |
|---|---|---|
| `type` | `"LEAVE_REMINDER"` | |
| `reminderType` | `"STARTING_TOMORROW"` / `"ENDING_TODAY"` | |
| `title` | string | |
| `body` | string | |
| `leaveRequestId` | string | |
| `requestNumber` | string | |
| `leaveType` | string | |
| `startDate` | string | Tanggal mulai (format lokal id-ID) |
| `endDate` | string | Tanggal selesai (format lokal id-ID) |

**Aksi mobile:** notifikasi info saja, navigasi ke detail pengajuan.

---

### Tipe: `SHIFT_SWAP_ACTION` — Tukar shift memerlukan aksi

Dikirim ke **pegawai tujuan** atau **Kepala Unit**.

| Field | Nilai | Keterangan |
|---|---|---|
| `type` | `"SHIFT_SWAP_ACTION"` | |
| `action` | `"RESPOND"` / `"APPROVE"` | `RESPOND` = untuk pegawai tujuan; `APPROVE` = untuk Kepala Unit |
| `title` | string | |
| `body` | string | |
| `shiftSwapId` | string | ID permintaan tukar shift |
| `requesterName` | string | Nama pemohon |
| `targetName` | string | Nama tujuan *(hanya saat `action: APPROVE`)* |
| `requesterShift` | string | Nama shift pemohon *(hanya saat `action: RESPOND`)* |
| `requesterDate` | string | Tanggal kerja pemohon *(hanya saat `action: RESPOND`)* |
| `targetShift` | string | Nama shift tujuan *(hanya saat `action: RESPOND`)* |
| `targetDate` | string | Tanggal kerja tujuan *(hanya saat `action: RESPOND`)* |

**Aksi mobile:**
- `RESPOND` → tampilkan form terima/tolak → `POST /shift-swaps/:id/accept` atau `POST /shift-swaps/:id/reject`
- `APPROVE` → tampilkan form setujui/tolak (Kepala Unit) → `POST /shift-swaps/:id/approve` atau `POST /shift-swaps/:id/reject`

---

### Tipe: `SHIFT_SWAP_RESULT` — Hasil tukar shift

Dikirim ke **pemohon dan pegawai tujuan**.

| Field | Nilai | Keterangan |
|---|---|---|
| `type` | `"SHIFT_SWAP_RESULT"` | |
| `result` | `"APPROVED"` / `"REJECTED"` | |
| `title` | string | |
| `body` | string | |
| `shiftSwapId` | string | |
| `rejectedBy` | `"TARGET"` / `"KEPALA"` | Hanya ada saat `result: REJECTED` |

**Aksi mobile:** notifikasi info saja, navigasi ke detail tukar shift.

---

### Tipe: `ATTENDANCE_REMINDER` — Pengingat absensi

Dikirim ke **pegawai** oleh job terjadwal per jam.

| Field | Nilai | Keterangan |
|---|---|---|
| `type` | `"ATTENDANCE_REMINDER"` | |
| `reminderType` | `"CHECKIN"` / `"CHECKOUT"` | |
| `title` | string | |
| `body` | string | |
| `shiftName` | string | Nama shift (mis. `"Pagi"`, `"Siang"`, `"Malam"`) |
| `tanggalKerja` | string | Tanggal kerja (format lokal id-ID) |

**Aksi mobile:** buka layar absen → `POST /attendance`.
