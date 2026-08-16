#pragma once
#include <Arduino.h>

void displayBegin();

// Full-screen status message (splash, error, dsb).
void displayMessage(const String &title, const String &subtitle = "", uint16_t color = 0xFFFF);

// Panel dengan QR + header + footer status.
struct DisplayState {
  String deviceLabel;      // "ESP32-IGD-01"
  String deviceId;         // "abcdef123456"
  String clock;            // "07:42"
  int wifiRssi;            // 0 kalau disconnected
  uint16_t intervalSec;
  uint16_t secondsLeft;    // countdown ke rotasi berikutnya
  String bleStatus;        // "BLE ON" / "BLE OFF"
};

void displayRenderQr(const String &qrPayload, const DisplayState &state);

// Untuk captive portal — instruksi ke user.
void displayShowCaptivePortalHint(const String &ssid, const String &ipHint);
