#include "configsync.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "mbedtls/md.h"
#include "config.h"
#include "timesync.h"

static String hexEncode(const uint8_t *data, size_t len) {
  static const char *hex = "0123456789abcdef";
  String s;
  s.reserve(len * 2);
  for (size_t i = 0; i < len; i++) {
    s += hex[(data[i] >> 4) & 0xF];
    s += hex[data[i] & 0xF];
  }
  return s;
}

static String hmacSig(const String &deviceId, uint32_t ts, const String &secretHex) {
  String msg = deviceId + String(ts);
  uint8_t digest[32];
  const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, md, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char *) secretHex.c_str(), secretHex.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char *) msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, digest);
  mbedtls_md_free(&ctx);
  return hexEncode(digest, 32).substring(0, 16);
}

bool configSync(DeviceConfig &cfg) {
  if (cfg.serverUrl.length() == 0 || !cfg.isEnrolled()) return false;
  uint32_t ts = nowEpoch();
  if (ts == 0) return false;

  String url = cfg.serverUrl;
  while (url.endsWith("/")) url.remove(url.length() - 1);
  url += "/api/v1/devices/config";

  HTTPClient http;
  WiFiClientSecure secureClient;
  bool isHttps = url.startsWith("https://");
  if (isHttps) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", String("CutiSmart-CYD/") + FIRMWARE_VERSION);
  http.setTimeout(8000);

  JsonDocument req;
  req["device_id"] = cfg.deviceId;
  req["ts"]        = (uint32_t) ts;
  req["sig"]       = hmacSig(cfg.deviceId, ts, cfg.secretHex);
  String payload;
  serializeJson(req, payload);

  int code = http.POST(payload);
  String body = http.getString();
  http.end();

  if (code != 200) {
    Serial.printf("[configsync] HTTP %d: %s\n", code, body.c_str());
    return false;
  }

  JsonDocument res;
  if (deserializeJson(res, body)) return false;

  bool changed = false;

  const char *labelC = res["label"] | (const char *) nullptr;
  String newLabel = labelC ? String(labelC) : String("");
  if (newLabel.length() > 0 && newLabel != cfg.deviceLabel) {
    cfg.deviceLabel = newLabel;
    changed = true;
  }

  uint16_t newInterval = res["interval_rotasi_detik"] | cfg.intervalSec;
  if (newInterval > 0 && newInterval != cfg.intervalSec) {
    cfg.intervalSec = newInterval;
    changed = true;
  }

  bool newBeacon = res["beacon_broadcast_enabled"] | cfg.beaconEnabled;
  if (newBeacon != cfg.beaconEnabled) {
    cfg.beaconEnabled = newBeacon;
    changed = true;
  }

  if (changed) storeSave(cfg);
  return changed;
}
