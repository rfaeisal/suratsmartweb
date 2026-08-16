# CutiSmart Attendance Firmware — ESP32 CYD

Firmware untuk perangkat absensi berbasis **ESP32-2432S028R** (Cheap Yellow Display, revisi USB-C). Menampilkan **QR yang berputar tiap 30 detik** untuk di-scan oleh app CutiSmart mobile, sekaligus **broadcast iBeacon** sebagai proof-of-proximity.

## Fitur

- ✅ WiFi captive portal (SSID `CutiSmart-Setup`) — user isi SSID rumah + kode enroll
- ✅ Enroll otomatis via `POST /api/v1/devices/enroll` — device dapat `deviceId`, `secret`, `iBeacon`, interval rotasi
- ✅ NTP sync (WIB, `pool.ntp.org` + fallback `time.google.com`)
- ✅ QR rotating (HMAC-SHA256, format `deviceId|counter|hmac8` — cocok dengan `lib/qr-verifier.ts`)
- ✅ iBeacon BLE advertise via NimBLE (UUID/major/minor dari server)
- ✅ Factory reset: tahan tombol **BOOT (GPIO0)** selama 5 detik
- ✅ Status bar di layar: label device, jam, WiFi, status BLE, countdown rotasi

## Hardware

- Board: **ESP32-2432S028R** revisi USB-C (chip ESP-WROOM-32, TFT 2.8" ILI9341 240×320, touch XPT2046, backlight GPIO21)
- USB: gunakan **port USB-C** untuk flash (rev 1 hanya micro; rev 2 punya keduanya)
- Power: 5 V via USB. Untuk deployment permanen, adaptor 5 V/1 A stabil.

## Instal PlatformIO

```bash
brew install platformio        # macOS
# atau: pipx install platformio
```

Buka VS Code + ekstensi PlatformIO IDE juga bisa.

## Build & Flash

```bash
cd firmware/cutismart-attendance
pio run                        # compile
pio run -t upload              # flash via USB
pio device monitor             # lihat serial log
```

Kalau board tidak masuk mode flash otomatis: tekan tahan **BOOT**, tekan **RESET** sekali, lepas **BOOT**, lalu upload.

## Alur Provisioning (Sekali per Device)

1. **Admin** buka `/admin/attendance/devices` → klik tombol **Enroll** pada baris device → catat kode 8 karakter (berlaku 15 menit).
2. **Colokkan ESP32 CYD** ke listrik. Layar akan tampil:
   ```
   SETUP MODE
   Sambungkan HP ke WiFi:
   CutiSmart-Setup
   Lalu buka: http://192.168.4.1
   ```
3. **Di HP**, connect ke WiFi `CutiSmart-Setup` (tanpa password). Buka `http://192.168.4.1` (biasanya captive portal auto-open).
4. **Isi**:
   - Pilih SSID WiFi kantor + password
   - URL Server: `https://cuti.appsmart.my.id` (default sudah terisi)
   - Kode Enroll: (dari langkah 1)
5. Simpan. ESP32 restart → connect WiFi → NTP sync → POST enroll → simpan credential ke NVS → mulai rotating QR.
6. Selesai. Setelah ini device auto-boot ke mode operasi.

## Alur Operasi

```
BOOT → cek NVS
   ├─ tidak enrolled → PROVISION → NTP → ENROLL → RUN
   └─ enrolled       → WiFi connect → NTP → RUN
```

Di mode `RUN`, tiap tick (500 ms) firmware menghitung `counter = floor(now / interval)`, kalau berubah maka rebuild token + redraw QR. Footer update tiap 1 detik.

## Factory Reset

Tahan tombol **BOOT (GPIO0)** selama 5 detik saat perangkat menyala. Layar berubah merah `RESET…`, semua konfigurasi NVS dihapus, device restart ke mode setup.

## Protokol QR (match dengan server)

```
token = "{deviceId}|{counter}|{hmac8}"
counter = floor(unix_epoch / interval_rotasi_detik)
hmac    = HMAC-SHA256(key=secretHex_as_utf8, msg=deviceId + counterStr)
hmac8   = hex(hmac).slice(0, 8)
```

Server (`lib/qr-verifier.ts`) memvalidasi:
- Counter cocok atau counter-1 (window 1 slot)
- HMAC 8 char pertama match
- Dedup per `(employee, device, counter)`

## Konfigurasi Build

Edit `include/config.h`:
- `NTP_TZ_OFFSET_SEC` — offset zona waktu (WIB = 7*3600)
- `BUTTON_RESET_HOLD_MS` — durasi tahan reset
- `WIFI_PORTAL_TIMEOUT_SEC` — timeout captive portal

Edit `platformio.ini`:
- `AP_SSID` — nama WiFi setup
- `FIRMWARE_VERSION`

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Layar putih | TFT_BL bukan HIGH | Cek `TFT_BL=21` di build_flags |
| QR tidak muncul, "Waktu belum sync" | NTP timeout | Cek internet + DNS di WiFi |
| Enroll gagal `HTTP err: -1` | HTTPS gagal / URL salah | Coba `http://` dulu, atau pin CA |
| "Kode kedaluwarsa" | Token > 15 menit | Generate ulang di admin panel |
| iBeacon tidak terdeteksi HP | UUID salah / TX rendah | Cek nRF Connect app, verifikasi UUID |

## TODO / Roadmap

- [ ] Pinning CA root untuk HTTPS (sekarang `setInsecure()` sementara)
- [ ] OTA update (`ArduinoOTA` atau HTTPS OTA)
- [ ] Endpoint `/api/v1/devices/config` untuk refresh interval tanpa reflash
- [ ] Support touch screen untuk in-app diagnostik
- [ ] Buzzer feedback saat counter berputar (opsional)
