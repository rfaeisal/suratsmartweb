# Update Backend untuk Tim Mobile — Window Absen per Shift

**Tanggal:** 2026-08-19
**Repo backend:** `cutismart-web` — commit `c3c389c`
**Terkait spec:** `docs/03-API-SPEC.md` bagian "Modul Absensi"

Halo tim mobile, ada perubahan cukup signifikan di endpoint absen yang perlu
disikapi sebelum deploy production. Ringkasannya:

## TL;DR

1. `POST /api/v1/attendance` sekarang bisa balikin 3 kode error baru untuk
   `event_type: masuk|pulang` — perlu handling di UI.
2. Ada endpoint baru `GET /api/v1/rosters/today` yang wajib dipakai supaya
   tombol Absen Masuk/Pulang bisa aktif/nonaktif akurat.
3. Absen lembur (`lembur_masuk`/`lembur_pulang`) — dari sisi client tidak
   berubah. Tetap sukses. Server yang urus notif ke atasan.
4. Perlu koordinasi timing deploy karena default-nya strict.

---

## 1. Kode error baru di `POST /api/v1/attendance`

Untuk `event_type: masuk` atau `pulang`, response 422 bisa datang dengan:

| `error.code` | Arti | `error.details` |
|---|---|---|
| `NO_ROSTER` | Pegawai tidak punya jadwal di tanggal itu | — |
| `OUTSIDE_CHECK_IN_WINDOW` | Tap masuk di luar rentang jam | `window_start`, `window_end` (ISO8601 UTC) |
| `OUTSIDE_CHECK_OUT_WINDOW` | Tap pulang di luar rentang jam | idem |

Rekomendasi UX:

- `NO_ROSTER` → "Anda tidak memiliki jadwal kerja hari ini. Hubungi admin unit
  Anda kalau ini keliru."
- `OUTSIDE_CHECK_IN_WINDOW` → parse `details.window_start` dan `window_end`,
  tampilkan lokalnya, misal: "Absen masuk hanya bisa dilakukan antara 06:00
  sampai 07:15."
- `OUTSIDE_CHECK_OUT_WINDOW` → sama, tapi untuk pulang.

Lembur (`lembur_masuk`/`lembur_pulang`) **tidak divalidasi** — tetap sukses
walau tanpa Overtime SAH; server yang kirim notif FCM ke Kepala Unit untuk
validasi manual. Tidak perlu perubahan di sisi client.

## 2. Endpoint baru: `GET /api/v1/rosters/today`

Return jadwal hari ini plus status boleh tap sekarang. Ini cara paling akurat
untuk enable/disable tombol absen di UI, karena `now` dihitung server-side.

**Request:** tanpa query = jadwal milik pegawai yang login. (Admin bisa kirim
`?employee_id=<id>` untuk lookup pegawai lain.)

**Response:**

```json
{
  "tanggal_wib": "2026-08-19",
  "roster": {
    "id": "clx…",
    "employee_id": "clx…",
    "work_unit_id": "clx…",
    "tanggal_kerja": "2026-08-19",
    "shift": {
      "nama": "Shift Pagi",
      "start_time": "07:00",
      "end_time": "14:00",
      "crosses_midnight": false
    }
  },
  "window": {
    "check_in":  { "start": "2026-08-19T00:00:00.000Z", "end": "2026-08-19T00:15:00.000Z", "source": "shift" },
    "check_out": { "start": "2026-08-19T06:30:00.000Z", "end": "2026-08-19T09:00:00.000Z", "source": "default" }
  },
  "can_check_in": true,
  "can_check_out": false,
  "overtime_status_today": null
}
```

Kalau tidak ada roster hari ini (dan tidak ada shift kemarin yang
`crosses_midnight` menutupi `now`), `roster` dan `window` = `null`, dan
`can_check_in`/`can_check_out` = `false`.

Field `source`: `"shift"` = window pakai setting yang admin isi di master
shift; `"default"` = fallback sistem. Boleh diabaikan di UI kecuali untuk
debug.

`overtime_status_today` bernilai `"DIAJUKAN" | "DISETUJUI_UNIT" | "SAH" | "DITOLAK" | null` — bermanfaat kalau mau
menampilkan status pengajuan lembur di halaman home.

**Saran polling:** panggil endpoint ini saat layar home aktif (on-focus) dan
tiap ~60 detik selama user diam di sana, supaya tombol berubah state tepat
waktu tanpa user perlu refresh manual.

## 3. Field baru di response `GET /api/v1/shifts` (dan `POST/PATCH`)

Kalau mobile membaca daftar shift, sekarang ada 4 field tambahan (nullable):

```json
{
  "id": "…",
  "nama": "Shift Pagi",
  "start_time": "07:00",
  "end_time": "14:00",
  "check_in_window_start": "06:00",   // atau null
  "check_in_window_end":   "07:15",   // atau null
  "check_out_window_start": "13:30",  // atau null
  "check_out_window_end":  "16:00"    // atau null
}
```

Kalau `null` → server pakai fallback default. Tidak perlu ditampilkan di UI
mobile kecuali memang mau — nilai window "efektif" sudah ada di
`/rosters/today`.

## 4. Timing deploy — perlu koordinasi

Begitu deploy production:

- Semua unit **default strict** (`allowAttendanceWithoutRoster = false`).
- Semua shift **default pakai window default** (60 menit sebelum shift start
  s/d `toleransi_telat_menit` = 15 menit setelah start; pulang 30 menit
  sebelum end s/d 120 menit setelah end).

Artinya pegawai yang selama ini bisa tap "asal ada QR" akan langsung dapat
error kalau tidak ada roster / di luar window default.

Sebelum deploy production, sebaiknya:

- Roster hari-hari mendatang sudah lengkap untuk semua unit yang perlu
  strict; **atau**
- Admin kepegawaian toggle `allowAttendanceWithoutRoster = true` untuk unit
  yang belum siap (dari halaman `/admin/units/<id>` → tombol Edit) sebagai
  mode transisi.

Kalau mau langsung longgar dulu untuk seluruh sistem: admin bisa set
setting global `attendance_allow_no_roster = "true"` (via panel Settings /
seed data) — ini overrule flag per unit.

## Checklist buat tim mobile

- [ ] Handle 3 kode error baru di layar absen (`NO_ROSTER`,
  `OUTSIDE_CHECK_IN_WINDOW`, `OUTSIDE_CHECK_OUT_WINDOW`)
- [ ] Panggil `GET /api/v1/rosters/today` di layar home; disable tombol
  absen bila `can_check_in`/`can_check_out` = false
- [ ] Tampilkan jam window di UI (parse `window.check_in.start/end` dan
  `check_out.start/end`) supaya user tahu kapan bisa absen
- [ ] (Opsional) tampilkan status lembur hari ini pakai
  `overtime_status_today`
- [ ] Rilis mobile app dulu ATAU koordinasi deploy backend supaya user
  build lama nggak bingung dapat error tanpa pesan yang tepat

Kalau ada pertanyaan atau butuh tambahan field di `/rosters/today`,
langsung tanya di thread ini. 🙏
