# CutiSmart — Integrasi dengan Aplikasi Kepegawaian Lama (PHP)

Dokumen ini adalah **kontrak API baru** yang perlu dibangun di sisi aplikasi lama (PHP — native/Laravel/CodeIgniter, menyesuaikan yang dipakai). CutiSmart (Next.js) bertindak sebagai **konsumen**, sistem lama sebagai **penyedia** endpoint berikut.

> Karena stack lama belum pasti (native/Laravel/CodeIgniter), spesifikasi ini dibuat framework-agnostic (format request/response JSON via HTTP). Tim yang memegang aplikasi lama tinggal mengimplementasikan route/controller sesuai kontrak ini di framework apa pun yang dipakai.

## 1. Keamanan Komunikasi
- Semua request dari Next.js ke sistem lama menggunakan **API Key + HMAC signature** (bukan sesi cookie), karena ini komunikasi server-to-server:
  - Header `X-API-Key: <key>`
  - Header `X-Signature: HMAC_SHA256(secret, timestamp + body)`
  - Header `X-Timestamp: <unix_epoch>` (tolak request jika selisih > 5 menit, mencegah replay)
- Endpoint hanya bisa diakses dari IP server Next.js (whitelist di firewall/web server sistem lama) karena deployment on-premise dan satu jaringan internal.
- Gunakan HTTPS jika memungkinkan; jika hanya HTTP internal, pastikan berada di jaringan tertutup/VLAN.

## 2. Endpoint yang Perlu Dibuat di Sistem Lama

### 2.1 `POST /api/sso/validate` — Validasi Login (SSO)
Dipanggil saat pegawai login di CutiSmart (web/mobile).

Request:
```json
{ "username": "string", "password": "string" }
```
Response sukses (200):
```json
{
  "valid": true,
  "employee": {
    "legacyId": "12345",
    "nip": "198501012010011001",
    "fullName": "Nama Pegawai",
    "employeeType": "PNS",
    "isActive": true
  }
}
```
Nilai yang valid untuk `employeeType`: `PNS`, `PPPK`, `PPPK_PARUH_WAKTU`, `BLUD`.

> **Catatan**: field `unit`, `positionTitle`, dan `directSupervisorLegacyId` **tidak perlu disertakan** — data ini dikelola secara manual oleh admin kepegawaian di CutiSmart dan tidak diambil dari sistem lama.

Response gagal (200 dengan `valid: false`, atau 401):
```json
{ "valid": false, "message": "Username atau password salah" }
```
> Catatan keamanan: endpoint ini menerima password pegawai dari Next.js — pastikan dikirim hanya via HTTPS/jaringan internal terenkripsi, dan sistem lama **tidak boleh mengembalikan password** dalam bentuk apa pun.

### 2.2 `GET /api/employees/:legacyId` — Ambil Detail Pegawai
Untuk pencocokan data identitas pegawai secara individual.

Response:
```json
{
  "legacyId": "12345",
  "nip": "...",
  "fullName": "...",
  "employeeType": "PNS",
  "isActive": true
}
```
> Field `unit`, `positionTitle`, dan `directSupervisorLegacyId` tidak perlu disertakan.

### 2.3 `GET /api/employees?updatedSince=` — Sinkronisasi Massal
Untuk sinkronisasi awal seluruh data pegawai dan incremental sync.

Query params (semua opsional):
- `updatedSince` — filter pegawai yang datanya berubah sejak waktu ini (ISO 8601, mis. `2026-07-01T00:00:00Z`)

Response:
```json
[
  {
    "legacyId": "12345",
    "nip": "198501012010011001",
    "fullName": "Budi Santoso",
    "employeeType": "PNS",
    "isActive": true
  }
]
```
> Field `unit`, `positionTitle`, dan `directSupervisorLegacyId` tidak perlu disertakan — CutiSmart tidak menggunakannya saat sinkronisasi.

> Gunakan `updatedSince` untuk incremental sync — sistem lama hanya mengembalikan pegawai yang profilnya berubah sejak timestamp tersebut, agar payload tidak terlalu besar.

### 2.4 `POST /api/leave/approved` — Terima Data Cuti yang Sudah Disetujui **(paling kritikal)**
Dipanggil oleh Next.js setelah SK cuti terbit, agar tercatat di profil pegawai pada sistem lama.

Request:
```json
{
  "requestNumber": "CS-2026-000123",
  "employeeLegacyId": "12345",
  "leaveTypeCode": "CUTI_TAHUNAN",
  "leaveTypeName": "Cuti Tahunan",
  "startDate": "2026-08-01",
  "endDate": "2026-08-05",
  "totalDays": 5,
  "skNumber": "800/123/SK/2026",
  "skFileUrl": "https://cutismart.internal/files/sk/CS-2026-000123.pdf",
  "delegateEmployeeLegacyId": "12300",
  "approvalTrail": [
    { "roleLabel": "Atasan Langsung", "approverLegacyId": "...", "decidedAt": "2026-07-20T10:00:00Z" },
    { "roleLabel": "Kepala Bagian", "approverLegacyId": "...", "decidedAt": "2026-07-21T09:00:00Z" },
    { "roleLabel": "Wakil Direktur", "approverLegacyId": "...", "decidedAt": "2026-07-22T14:00:00Z" }
  ]
}
```
Response sukses:
```json
{ "success": true, "legacyLeaveRecordId": "9876" }
```
Response gagal:
```json
{ "success": false, "errorCode": "EMPLOYEE_NOT_FOUND", "message": "..." }
```

**Idempotency**: sistem lama harus menolak/mengabaikan duplikasi berdasarkan `requestNumber` (unique) jika endpoint ini dipanggil ulang (retry) — kembalikan `success: true` dengan data yang sudah ada, bukan membuat record ganda.

## 3. Alur Retry di Sisi CutiSmart
- Setiap pemanggilan endpoint 2.4 dicatat di tabel `IntegrationLog` (lihat `02-ARSITEKTUR-DAN-DATABASE.md`).
- Jika gagal (timeout, 5xx, `success:false`), status pengajuan → `SEND_FAILED`, admin bisa retry manual dari admin panel.
- Setelah `success:true`, status pengajuan → `SENT_TO_LEGACY` (final).

## 4. Yang Perlu Dikonfirmasi ke Tim Sistem Lama (Action Items)
1. Framework aktual yang dipakai (PHP native / Laravel / CodeIgniter) — untuk memastikan implementasi HMAC & routing sesuai konvensi mereka.
2. Struktur tabel pegawai lama (kolom-kolom yang tersedia: NIP, unit, jabatan, atasan, kategori kepegawaian) — untuk memetakan field di atas.
3. Format & sumber nomor SK yang berlaku di instansi (agar penomoran tidak bentrok dengan sistem persuratan lain).
4. Apakah sistem lama sudah punya tabel riwayat cuti, atau perlu dibuatkan tabel baru untuk penyimpanan hasil `POST /api/leave/approved`.
