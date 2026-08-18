# 07 — Brief Integrasi Face Recognition untuk Tim Mobile

Dokumen ini adalah brief handover ke tim `cutismart-mobile` (Flutter) untuk
implementasi face recognition di app absensi.

Backend + admin panel sudah siap di production
(`https://cuti.appsmart.my.id`). Tugas mobile: enrollment flow, capture
wajah + liveness saat absen, integrasi dengan endpoint yang sudah dibuat.

## 1. Referensi Dokumen

- Konsep + rationale: [`06-FACE-RECOGNITION-PRD.md`](./06-FACE-RECOGNITION-PRD.md)
- Kontrak API: [`03-API-SPEC.md`](./03-API-SPEC.md) section **9b (Enrollment)**,
  **9c (Manual Recovery — abaikan, ini web)**, dan extension **`POST /attendance`**
  dengan field `face`.

## 2. Library & Model (LOCK)

**Konfirmasi 2026-08-18: model & contract di-lock**

| Aspek | Nilai |
| --- | --- |
| Face detection + landmark | `google_ml_kit_face_detection` (gratis, cross-platform) |
| Face embedding | **MobileFaceNet TFLite** dari `sirius-ai/MobileFaceNet_TF` |
| File di repo mobile | `assets/models/mobilefacenet.tflite` |
| Input | 112×112 RGB float32, aligned crop |
| Preprocessing | `(px − 127.5) / 127.5` |
| Output | Embedding 128-dim float32 |
| `embeddingModelVersion` string | **`"mobilefacenet-sirius-v1"`** (kirim persis string ini) |
| TFLite runtime | `tflite_flutter` |
| Encrypted local storage | `flutter_secure_storage` (untuk simpan embedding sendiri = offline preview cue) |

**Konsistensi preprocessing enrollment vs runtime wajib.** Semua call site
harus pakai satu utility class `FaceEmbedder` yang single-source-of-truth.

Backend TIDAK menjalankan model — hanya membandingkan cosine similarity.
Backend cek `embeddingModelVersion` sama antara enrollment dan runtime;
kalau beda → `FACE_MISMATCH` (paksa re-enroll).

## 3. Flow Enrollment

1. Pegawai datang ke bagian kepegawaian. Admin buka menu **Enrollment
   Wajah** di admin panel, pilih pegawai, klik "Buat Sesi". Muncul **QR di
   layar admin** dengan payload:
   ```
   cs-enroll:XXXXXXXX
   ```
   (8 char alphanumeric, TTL 5 menit).

2. Di app CutiSmart: menu **Profil → Enroll Wajah** → tombol "Scan QR
   Enrollment". Reuse scanner QR absen yang sudah ada; **deteksi prefix
   `cs-enroll:`** untuk bedakan dari QR absen ESP32 (format
   `deviceId|counter|hmac`). Extract `token` = 8 char setelah prefix.

3. App guide pegawai capture 3–5 selfie beda angle:
   - Frontal
   - Miring kiri sedikit
   - Miring kanan sedikit
   - (Opsional) sedikit tunduk / dongak

   Quality check per frame (tolak & minta retake kalau gagal):
   - Wajah terdeteksi (Google ML Kit).
   - Tidak blur (Laplacian variance atau ML Kit signal).
   - Cukup terang.
   - Hanya 1 wajah dalam frame.

4. Hitung **embedding on-device** dari selfie terbaik (mis. hitung dari
   semua capture lalu ambil average, atau ambil embedding dari frame paling
   frontal + tajam). Buat **thumbnail crop wajah 160×160 JPEG q70** (~15 KB).

5. `POST /api/v1/employees/me/face-enrollment`:
   ```json
   {
     "token": "AB3F9XKM",
     "embedding": [0.123, -0.045, ...],
     "embeddingModelVersion": "mobilefacenet-v1",
     "thumbnailBase64": "/9j/4AAQSkZJRg...",
     "deviceInfo": {
       "model": "Xiaomi Redmi Note 12",
       "os": "Android 14",
       "cameraResolution": "1280x720"
     }
   }
   ```

6. Response 200:
   ```json
   {
     "id": "cmxy1234abcdef",
     "status": "SUBMITTED",
     "message": "Enrollment dikirim. Menunggu persetujuan admin."
   }
   ```
   App tampilkan status "Menunggu approval admin". Admin approve
   on-the-spot (proses 30 detik).

7. **Simpan embedding pegawai sendiri di `flutter_secure_storage`**
   (encrypted) — biar bisa preview "wajah sesuai" indicator saat capture
   absen (UX cue, bukan security).

### 3a. Cek status enrollment (polling)

Untuk update UI "Menunggu approval → Disetujui / Ditolak", app polling
endpoint ringan:

**`GET /api/v1/employees/me/face-enrollment-status`** (auth PEGAWAI)

Response:
```json
{
  "hasEnrollment": true,
  "enrolledAt": "2026-08-18T05:32:00.000Z",
  "modelVersion": "mobilefacenet-sirius-v1",
  "activeSession": {
    "id": "cuid",
    "status": "SUBMITTED",
    "createdAt": "…",
    "tokenExpiresAt": "…",
    "submittedAt": "…",
    "rejectedAt": null,
    "rejectReason": null
  }
}
```

- `hasEnrollment` — true kalau `Employee.faceEmbedding` sudah ada
  (pernah approved).
- `activeSession` — sesi terbaru dengan status PENDING / SUBMITTED /
  REJECTED. Kalau APPROVED (data sudah pindah ke Employee) atau tidak ada
  sesi baru → null. Sesi REJECTED yang sudah lebih dari 7 hari juga di-
  drop kalau ada enrollment yang sudah approved sebelumnya (biar UI tidak
  tampilin banner reject yang basi).

Rekomendasi polling interval saat user di halaman "Enroll Wajah": 3–5
detik, stop kalau `hasEnrollment=true` atau `activeSession.status ==
REJECTED`.

### 3b. Push notif approve/reject (FCM)

Backend juga kirim FCM saat admin approve/reject supaya UX tidak butuh
polling terus-menerus.

Payload FCM data (data-only message, konsisten dengan event notif lain):
```json
{
  "type": "face_enrollment_status",
  "status": "APPROVED",
  "sessionId": "cuid",
  "title": "Enrollment Wajah Disetujui",
  "body": "Anda sudah bisa absen dengan verifikasi wajah."
}
```
```json
{
  "type": "face_enrollment_status",
  "status": "REJECTED",
  "sessionId": "cuid",
  "reason": "Foto blur, ulangi capture",
  "title": "Enrollment Wajah Ditolak",
  "body": "Alasan: Foto blur, ulangi capture"
}
```

App handling: navigate ke halaman Profil dengan banner status.

## 4. Flow Absen (Extended)

Kalau unit device tempat absen **wajib face verification** (dikonfigurasi
admin per unit — mobile tidak perlu tahu daftar unit), mobile harus
sertakan `face` di request. Kalau unit tidak require, kirim tanpa `face`
tetap valid.

**Rekomendasi**: **selalu** jalankan capture face + liveness untuk semua
absen. Kalau unit tidak require, server abaikan; kalau require, langsung
bisa. Menghindari flow bercabang di client + konsisten UX.

Request body `POST /api/v1/attendance`:
```json
{
  "qr_token": "…",
  "event_type": "masuk",
  "beacon": { "detected": true, "uuid": "…", "major": 1, "minor": 1 },
  "client_time": "2026-08-18T08:00:00Z",
  "face": {
    "embedding": [0.123, -0.045, ...],
    "embedding_model_version": "mobilefacenet-v1",
    "liveness_score": 0.87,
    "liveness_challenge": "BLINK,HEAD_LEFT"
  }
}
```

## 5. Liveness Check

Kombinasi passive + active challenge.

- **Passive** (background, tanpa aksi user): head pose sanity, eye open
  probability, smile probability dari Google ML Kit.
- **Active challenge** (MVP mobile 2026-08-18):
  - `HEAD_LEFT` — toleh kiri (yaw angle negative).
  - `HEAD_RIGHT` — toleh kanan (yaw angle positive).
  - `BLINK` — kedip mata. **Ditunda ke iterasi berikutnya** (butuh
    package `camera` realtime). Tambah kalau lapangan tunjukkan
    video-replay attack lolos.
- Timeout total 8–10 detik.
- Kalau gagal, retry.

Format field `liveness_challenge`: comma-separated uppercase dengan
`FRONTAL` sebagai passive marker + active challenge. Contoh:
- `"FRONTAL,HEAD_LEFT"`
- `"FRONTAL,HEAD_RIGHT"`
- Nanti kalau BLINK aktif: `"FRONTAL,BLINK,HEAD_LEFT"`

Backend tidak parse content — hanya simpan max 64 char untuk audit.

`liveness_score` (0.0–1.0) = skor gabungan. Kirim `1.0` saat lulus
challenge, atau abort di client tanpa POST kalau gagal. Backend threshold
default 0.5.

## 6. Error Handling

| Kode | HTTP | UX yang disarankan |
| --- | --- | --- |
| `FACE_NOT_ENROLLED` | 422 | "Wajah belum terdaftar. Datang ke bagian kepegawaian untuk enrollment." Tombol shortcut ke halaman enrollment. |
| `FACE_MISMATCH` (dengan `score` di details) | 422 | "Wajah tidak cocok (skor X). Coba lagi." Kalau berulang → arahkan re-enroll. |
| `FACE_LIVENESS_FAILED` (dengan `score`) | 422 | "Deteksi keaslian gagal. Ulangi dengan pencahayaan cukup, ikuti challenge." |
| `EMPLOYEE_INACTIVE` | 403 (saat login/refresh) | "Akun non-aktif. Hubungi kepegawaian." Force logout. |
| `BEACON_TIDAK_TERDETEKSI` | 422 | Existing — tetap tampilkan seperti sekarang. |
| `QR_EXPIRED` / `QR_REPLAYED` / `QR_INVALID` | 422 | Existing. |

## 7. Kompatibilitas Device

- Test di HP entry-level Android (kamera 5MP, RAM 3GB). MobileFaceNet
  TFLite harus jalan <500ms.
- Kalau TFLite tidak support / model gagal load, tampilkan pesan:
  > "HP tidak kompatibel dengan verifikasi wajah, hubungi kepegawaian."
  
  Fallback QR-only jika unit tidak require face; kalau require, absen
  ditolak backend dengan `FACE_NOT_ENROLLED`.
- Simpan `deviceInfo.cameraResolution` saat enroll — dipakai audit kalau
  kualitas menurun / debugging false negative.

## 8. Yang TIDAK Perlu Diimplement (Backend Handle)

- Cocokkan embedding vs stored — server pakai cosine similarity + threshold
  dari `AppSetting.face_match_threshold` (default 0.65).
- Cek apakah unit require face atau tidak — server tolak dengan
  `FACE_NOT_ENROLLED` kalau butuh tapi tidak dikirim.
- Simpan thumbnail permanen di server — hanya saat enrollment (1x per
  pegawai), bukan per absen.
- Approval flow — admin lakukan on-the-spot di admin panel.

## 9. Rollout & Testing

- Backend sudah live di `https://cuti.appsmart.my.id`.
- Testing lokal: pakai `LEGACY_SSO_MOCK=true` dengan akun (`pegawai1`, dll)
  — di dev mode face verification di-skip supaya tidak block dev tools.
- Pilot: 1 unit (kandidat: IGD atau unit dengan volume absen tinggi).
  Aktifkan flag di `/admin/settings` → "Unit yang wajib verifikasi wajah".
- Threshold awal konservatif: match 0.65, liveness 0.5. Kalau data
  lapangan menunjukkan false negative tinggi, admin bisa turunkan lewat
  settings tanpa deploy.

## 10. Kontak & Escalation

- Backend + admin panel maintainer: repo `cutismartweb`.
- Sumber kebenaran kontrak API: [`03-API-SPEC.md`](./03-API-SPEC.md) — kalau
  kontrak berubah, backend akan update duluan dan kabari.
- Ping backend kalau ada endpoint yang tidak jelas atau perlu tambahan
  field.
