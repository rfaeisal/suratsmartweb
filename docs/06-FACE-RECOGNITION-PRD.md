# 06 — PRD Face Recognition Absensi CutiSmart

Status: **Draft / Planning** (belum ada implementasi)
Fase: usulan tambahan untuk Fase Absensi (lanjutan `05-ALUR-KERJA`).

## Konteks

Sistem absensi CutiSmart saat ini mengandalkan 3 lapis: QR rotating dari ESP32
+ iBeacon proximity + device binding (1 akun 1 HP). Untuk memperkuat mitigasi
titip absen di dalam ruangan (orang meminjam HP teman), akan ditambah
verifikasi wajah di mobile app sebagai lapis keempat, **tanpa mengubah
firmware ESP32**.

## Tujuan

- Cegah titip absen: memastikan yang absen adalah orang yang wajahnya
  terdaftar, bukan siapa pun yang memegang HP itu.
- Tidak break kompatibilitas existing — flag `face_verification_required`
  per unit, aktifkan bertahap.

## Non-Tujuan

- Bukan pengganti QR/beacon/device binding. Face check adalah lapis tambahan.
- Bukan surveillance/pemantauan wajah — hanya verifikasi saat absen.
- Bukan absen full-offline (queue lokal) — offline handling via manual
  recovery admin (lihat bagian _Handling Offline_).

## Ruang Lingkup

### Enrollment

- Pegawai datang ke bagian kepegawaian **sekali**, bawa HP sendiri.
- Admin buka menu "Face Enrollment Session" → generate session token (5 menit)
  → pegawai input token di app.
- App capture 3–5 selfie beda angle dengan quality check di device
  (blur / darkness / single-face).
- Embedding dihitung on-device, dikirim ke server + 1 thumbnail 160×160 JPEG
  q70 untuk audit.
- Admin verifikasi tatap muka → klik **Approve** on-the-spot.
- Consent biometrik tersimpan sebagai bukti persetujuan.
- **Ganti HP = wajib re-enroll ulang di HR** (tidak ada self-service).

### Runtime Absen

- Setelah scan QR + beacon → mobile capture wajah + liveness → kirim
  `face_embedding` + `liveness_score` + `liveness_challenge` ke backend.
- Backend cocokkan **cosine similarity** vs stored embedding.
- **Threshold match awal**: cosine ≥ 0.65 (konservatif, boleh tuning via
  AppSetting).

### Liveness Check

- **Passive** (background, tanpa aksi user): moiré detection + head pose
  sanity + eye open probability.
- **Active challenge** (per sesi, random 2 dari 3):
  - Kedip mata
  - Toleh kanan
  - Toleh kiri
- Timeout 8–10 detik.
- **Threshold liveness awal**: 0.5.
- Skor tersimpan per Attendance untuk audit.

### Handling Offline

- **Tidak ada local queue** di mobile.
- Kalau HP offline → error "coba lagi" → user retry / lapor kepegawaian.
- **Manual Attendance Recovery** oleh `ADMIN_KEPEGAWAIAN` / `SUPERADMIN`:
  - Form input: pegawai, tanggal-jam, event type, room+device (opsional),
    alasan (required), bukti (opsional).
  - Status `MANUAL_RECOVERY` (enum baru) — terpisah dari `VALID`, terlihat
    di audit.
  - Ada laporan "Recovery Log" untuk memantau anomali (mis. 1 admin selalu
    input recovery untuk pegawai tertentu = red flag).

## Perubahan Data Model

| Field / Model | Tipe | Keterangan |
| --- | --- | --- |
| `Employee.faceEmbedding` | `Bytes` atau `Float[]` | Vektor 128-dim (MobileFaceNet) |
| `Employee.faceThumbnailUrl` | `String?` | Path 160×160 JPEG |
| `Employee.faceEnrolledAt` | `DateTime?` | Waktu approve admin |
| `Employee.faceEmbeddingModelVersion` | `String?` | Untuk migration path bila model diganti |
| `Employee.faceEnrollmentDeviceInfo` | `Json?` | Model HP, camera info |
| `Attendance.faceMatchScore` | `Float?` | Cosine similarity |
| `Attendance.livenessScore` | `Float?` | Skor gabungan liveness |
| `Attendance.livenessChallenge` | `String?` | Mis. `BLINK,HEAD_LEFT` |
| `Attendance.manualRecoveryBy` | `String?` | userId admin |
| `Attendance.manualRecoveryReason` | `String?` | Alasan input manual |
| `AttendanceStatus` enum | — | Tambah `MANUAL_RECOVERY` |
| `AppSetting` | key | `face_verification_required_units` (Json array unitId) |

## Endpoint Baru

- `POST /api/v1/admin/face-enrollment/session` — admin generate token sesi.
- `POST /api/v1/employees/me/face-enrollment` — mobile submit selfie/
  embedding dengan session token.
- `POST /api/v1/admin/face-enrollment/[id]/approve` — admin approve/reject.
- `GET /api/v1/admin/employees/[id]/face-thumbnail` — admin lihat thumbnail
  (log akses ke AuditLog).
- `POST /api/v1/admin/attendance/manual-recovery` — admin input absen manual.
- Extend `POST /api/v1/attendance` — terima `face_embedding` +
  `liveness_score` + `liveness_challenge`.

## Storage & Retensi

- Thumbnail wajah di `/uploads/face-thumbnails/{employeeId}.jpg`.
- Enkripsi at-rest (LUKS di server on-prem atau enkripsi manual dengan
  `DEVICE_SECRET_KEY`).
- Akses terbatas `SUPERADMIN` + `ADMIN_KEPEGAWAIAN`, semua akses tercatat
  di AuditLog.
- Auto-delete 90 hari setelah pegawai `isActive = false`.
- **Tidak simpan foto per absen** — hanya score. Pengecualian: kalau match
  score di bawah threshold tapi absen diloloskan admin override, simpan
  thumbnail attempt untuk audit.

## Library ML — Rekomendasi Final

### Mobile (Flutter)

- **`google_ml_kit_face_detection`** — deteksi wajah, landmark, head pose
  (pitch/yaw/roll), eye open probability, smile probability. Gratis,
  cross-platform Android+iOS. Sekaligus jadi input untuk liveness check +
  preprocessing (crop wajah) sebelum embedding.
- **`tflite_flutter`** — runtime untuk model TFLite.

**Model & contract yang DI-LOCK (konfirmasi tim mobile 2026-08-18):**

| Aspek | Nilai |
| --- | --- |
| Sumber model | `sirius-ai/MobileFaceNet_TF` → TFLite |
| File | `assets/models/mobilefacenet.tflite` di repo `cutismart-mobile` |
| Input | 112×112 RGB, float32 |
| Preprocessing | Aligned crop wajah, normalisasi `(px − 127.5) / 127.5` |
| Output | Embedding 128-dim float32 |
| `embeddingModelVersion` string | `"mobilefacenet-sirius-v1"` |

**Konsistensi preprocessing ANTARA enrollment DAN runtime absen bersifat
mandatory** — kalau enroll pakai `(px-127.5)/127.5` tapi runtime pakai
`px/255`, cosine similarity turun drastis dan pegawai selalu kena
`FACE_MISMATCH`. Semua call site (enrollment + attendance) HARUS pakai
utility class `FaceEmbedder` yang single-source-of-truth di mobile.

Backend TIDAK menjalankan model — hanya membandingkan cosine similarity
antara embedding kirim vs stored. Pilihan file .tflite ada di mobile.
Backend cukup validate bahwa `embedding_model_version` sama antara
enrollment dan runtime absen; kalau beda → `FACE_MISMATCH` (paksa
re-enroll).

### Backend (Next.js — Node.js)

- **Tidak butuh library face recognition**. Cukup fungsi cosine similarity
  manual (~10 baris JS).
- Tidak butuh Python microservice, tidak butuh GPU, tidak butuh dependency
  berat.

### Alasan Pilih Ini (bukan alternatif)

- **Kenapa on-device, bukan server-side compute** (InsightFace/DeepFace):
  server-side lebih akurat (ArcFace ~99.83%) tapi harus kirim foto tiap
  absen → bandwidth + privacy concern. On-device: foto tidak keluar HP,
  cuma vektor 128 float dikirim (~1KB).
- **Kenapa MobileFaceNet, bukan ArcFace TFLite** (~15MB): MobileFaceNet
  cukup untuk populasi ≤2000 orang closed-set + threshold 0.65 konservatif.
  3x lebih kecil, lebih cepat di HP entry-level. ArcFace jadi upgrade path.
- **Kenapa bukan cloud API** (AWS Rekognition / Azure Face): data biometrik
  pegawai instansi pemerintah — data residency wajib on-prem.
- **Kenapa Google ML Kit untuk detection tapi bukan recognition**: ML Kit
  tidak menyediakan face recognition, hanya detection + landmark. Bagus
  dan gratis — pakai untuk preprocessing + liveness metric.

### Konsekuensi Keputusan

- **Konsistensi model kritis**: enrollment dan runtime **wajib pakai model
  TFLite yang sama persis** — kalau ganti model, semua embedding lama
  invalid → **re-enroll massal**. Simpan versi model di
  `Employee.faceEmbeddingModelVersion` untuk audit + migration path.
- **HP entry-level**: MobileFaceNet compatible dengan TFLite runtime standar
  → jalan di 95%+ HP Android/iOS. Kalau ada HP super lawas yang tidak
  support, fallback ke error "HP tidak kompatibel, hubungi kepegawaian".

## Rollout

1. **Phase 1**: implementasi + enrollment 1 unit pilot (mis. IGD).
2. **Phase 2**: enable flag di unit pilot, jalankan 4–6 minggu, tuning
   threshold match & liveness.
3. **Phase 3**: rollout bertahap unit per unit.
4. **Phase 4**: jika kebutuhan muncul, tambahkan local queue offline
   (opsional iterasi kedua).

## Beacon Rotating Payload (di luar scope PRD ini)

Ditunda — tunggu bukti fraud dulu. Kalau nanti muncul kasus HP diprogram
spoof laporan beacon, ada opsi upgrade firmware ESP32 broadcast beacon
dengan payload berputar mirip QR (HMAC-signed dengan device secret +
counter). HP harus dengar dan forward payload → server verify sebagai
bukti proximity real. Estimasi effort ~1 minggu firmware + ~2–3 hari
mobile+backend.

## Estimasi Effort

| Area | Estimasi |
| --- | --- |
| Backend (endpoint, schema, cosine similarity) | 2–3 minggu |
| Mobile Flutter (kamera + ML + liveness + UX) | 3–4 minggu |
| Admin panel (session, approval, recovery, threshold) | 1 minggu |
| Testing lapangan + tuning threshold | 2–4 minggu |
| **Total realistis siap produksi 1 unit pilot** | **2–3 bulan** |

## Risiko & Mitigasi

- **False negative** (masker / pencahayaan buruk): audit `faceMatchScore`
  bulanan, tune threshold, sosialisasi pencahayaan area absensi.
- **Kembar identik / kakak-adik mirip**: kasus per kasus, admin override
  manual via Manual Attendance Recovery.
- **HP kamera jelek**: enrollment pakai HP yang sama = konsisten. Kalau
  tidak konsisten, embedding buruk → early false negative → indikasi
  butuh re-enroll.
- **Privasi/biometrik**: hanya simpan embedding + 1 thumbnail low-res,
  consent explicit, retensi terbatas, akses audited.
- **Outage jaringan luas**: manual recovery jadi bottleneck; kalau volume
  tinggi/rutin, dorong ke Phase 4 (offline queue).

## Item yang Perlu Dikonfirmasi Sebelum Eksekusi

- ✅ Model MobileFaceNet TFLite spesifik yang dipakai (LOCK 2026-08-18):
  `sirius-ai/MobileFaceNet_TF` → TFLite, version string
  `mobilefacenet-sirius-v1`.
- Enkripsi at-rest untuk thumbnail: LUKS di server on-prem atau enkripsi
  manual per-file — tergantung setup infra Coolify saat itu.
- SOP tertulis untuk penggunaan face thumbnail (siapa boleh akses, dalam
  kondisi apa) — draft dari bagian legal/kepegawaian.
- Draft consent form untuk pegawai (biometric consent) — perlu review legal.

## Bump Model di Masa Depan (Migration Plan)

Kalau nanti mobile ganti model (mis. ke `mobilefacenet-sirius-v2` atau
`arcface-r50-v1`), embedding lama otomatis tidak comparable dengan yang
baru — cosine similarity antar model beda arsitektur tidak meaningful.
**Tidak ada grace period technical yang bisa "mix" embeddingnya.**

Strategi migration yang direkomendasikan (operasional, bukan feature
backend):

1. **Sebelum push versi baru ke pegawai**, admin buat sesi enrollment
   massal untuk semua pegawai yang terdampak.
2. **Sementara transisi**, admin bisa **kosongkan
   `face_verification_required_units`** di settings — semua absen
   fallback ke QR + beacon. Ini "operational grace period".
3. Setelah 80%+ pegawai re-enroll dengan model baru, admin aktifkan lagi
   unit-nya.
4. Pegawai yang belum re-enroll akan kena `FACE_NOT_ENROLLED` saat unit
   sudah aktif kembali — mereka lapor ke kepegawaian untuk sesi
   enrollment.

Backend menyimpan `Employee.faceEmbeddingModelVersion` dan cek strict
consistency (kirim beda dengan stored → tolak). Ini disengaja karena
alternatif (accept mismatch) bakal produce cosine yang tidak akurat.
