#pragma once
#include <Arduino.h>

struct ProvisionResult {
  String serverUrl;
  String enrollCode;
};

// Blok sampai WiFi credentials + serverUrl + enrollCode diisi oleh user
// via captive portal AP "CutiSmart-Setup", lalu connect ke WiFi.
// Returns hasil form. Fungsi baru return setelah connect sukses.
ProvisionResult provisionWiFiCaptive(const String &defaultServerUrl);

// Coba connect ke WiFi yang sudah tersimpan sebelumnya. Return true kalau sukses
// dalam timeout.
bool tryConnectSavedWiFi(uint32_t timeoutMs = 20000);
