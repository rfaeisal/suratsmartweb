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

## 2. Library yang Dipakai

Konsistensi model wajib dengan backend supaya embedding comparable.

| Kebutuhan | Library / Model | Catatan |
| --- | --- | --- |
| Face detection + landmark | `google_ml_kit_face_detection` | Gratis, cross-platform. Untuk crop wajah + liveness signal (head pose, eye open, smile). |
| Face embedding (recognition) | **MobileFaceNet TFLite** ~5 MB, embedding 128-dim float32 | Sumber pretrained teruji (mis. `sirius-ai/MobileFaceNet_TF` converted, atau InsightFace mobile). **Jangan train sendiri.** |
| TFLite runtime | `tflite_flutter` | — |
| Encrypted local storage | `flutter_secure_storage` | Simpan embedding pegawai sendiri (untuk offline preview cue). |

Kirim `embeddingModelVersion` string (mis. `"mobilefacenet-v1"`) di setiap
request. Backend cek konsistensi; kalau beda dengan yang di-enroll, akan
return `FACE_MISMATCH` dan pegawai harus re-enroll.

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

6. Response 200: app tampilkan status "Menunggu approval admin". Admin
   approve on-the-spot (proses 30 detik).

7. **Simpan embedding pegawai sendiri di `flutter_secure_storage`**
   (encrypted) — biar bisa preview "wajah sesuai" indicator saat capture
   absen (UX cue, bukan security).

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

Kombinasi passive + active challenge (random 2 dari 3 per sesi).

- **Passive** (background, tanpa aksi user): head pose sanity, eye open
  probability, smile probability dari Google ML Kit.
- **Active challenge**: pilih 2 random per sesi dari:
  - `BLINK` — kedip mata (deteksi via drop eye open probability lalu
    naik lagi).
  - `HEAD_LEFT` — toleh kiri (yaw angle negative).
  - `HEAD_RIGHT` — toleh kanan (yaw angle positive).
- Timeout total 8–10 detik untuk complete kedua challenge.
- Kalau gagal, retry.

`liveness_score` (0.0–1.0) = skor gabungan. Contoh sederhana:
```
score = passive_score * 0.5 + (challenges_completed / challenges_asked) * 0.5
```
Kirim juga `liveness_challenge` = string comma-separated (mis.
`"BLINK,HEAD_LEFT"`) untuk audit.

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
