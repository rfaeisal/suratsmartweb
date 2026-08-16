#include "provision.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include "config.h"

bool tryConnectSavedWiFi(uint32_t timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(); // pakai kredensial NVS
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(200);
  }
  return WiFi.status() == WL_CONNECTED;
}

ProvisionResult provisionWiFiCaptive(const String &defaultServerUrl) {
  WiFiManager wm;
  wm.setConfigPortalBlocking(true);
  if (WIFI_PORTAL_TIMEOUT_SEC > 0) {
    wm.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_SEC);
  }

  // Custom parameter — server URL & enroll code
  char serverBuf[128];
  strncpy(serverBuf, defaultServerUrl.c_str(), sizeof(serverBuf) - 1);
  serverBuf[sizeof(serverBuf) - 1] = 0;

  char codeBuf[16] = {0};

  WiFiManagerParameter serverParam("srv", "URL Server (https://...)", serverBuf, 127);
  WiFiManagerParameter codeParam("code", "Kode Enroll (dari admin panel)", codeBuf, 15);
  wm.addParameter(&serverParam);
  wm.addParameter(&codeParam);

  wm.setTitle("CutiSmart Attendance Setup");
  wm.setClass("invert");

  // startConfigPortal memaksa AP mode + captive portal (blocking).
  bool ok = wm.startConfigPortal(AP_SSID);
  ProvisionResult r;
  r.serverUrl = String(serverParam.getValue());
  r.enrollCode = String(codeParam.getValue());
  r.enrollCode.trim();
  r.enrollCode.toUpperCase();

  if (!ok) {
    // Portal timeout atau failure — reboot supaya bisa retry
    delay(500);
    ESP.restart();
  }
  return r;
}
