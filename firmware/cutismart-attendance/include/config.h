#pragma once

// Default nilai kalau NVS kosong / untuk fallback.
#define DEFAULT_INTERVAL_SEC 30

// Tombol boot ESP32 (GPIO0) — long-press >5 detik = factory reset
#define BUTTON_RESET_PIN 0
#define BUTTON_RESET_HOLD_MS 5000

// NTP
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"
#define NTP_TZ_OFFSET_SEC (7 * 3600) // WIB
#define NTP_DST_OFFSET_SEC 0

// Captive portal timeout (detik) — 0 = tanpa timeout
#define WIFI_PORTAL_TIMEOUT_SEC 0

// Interval refresh redraw QR (ms) — recalc token & redraw kalau counter berubah
#define TICK_INTERVAL_MS 500
