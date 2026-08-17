#include "enroll.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "config.h"

EnrollOutcome enrollDevice(const String &serverUrl, const String &enrollCode, DeviceConfig &cfg) {
  EnrollOutcome out;
  if (serverUrl.length() == 0 || enrollCode.length() == 0) {
    out.status = EnrollStatus::BAD_CODE;
    out.message = "URL atau kode kosong";
    return out;
  }

  String url = serverUrl;
  while (url.endsWith("/")) url.remove(url.length() - 1);
  url += "/api/v1/devices/enroll";

  HTTPClient http;
  bool isHttps = url.startsWith("https://");
  WiFiClientSecure secureClient;
  if (isHttps) {
    // TODO(security): pinning root CA. Sementara insecure supaya connect ke on-prem
    // cert self-signed juga jalan; server yang benar tetap perlu HTTPS.
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", String("CutiSmart-CYD/") + FIRMWARE_VERSION);
  http.setTimeout(10000);

  JsonDocument reqBody;
  reqBody["enroll_code"] = enrollCode;
  String payload;
  serializeJson(reqBody, payload);

  int code = http.POST(payload);
  String body = http.getString();
  http.end();

  if (code <= 0) {
    out.status = EnrollStatus::NETWORK_ERROR;
    out.message = String("HTTP err: ") + code;
    return out;
  }

  JsonDocument res;
  DeserializationError err = deserializeJson(res, body);
  if (err) {
    out.status = EnrollStatus::PARSE_ERROR;
    out.message = "Respons tidak valid";
    return out;
  }

  if (code == 404) { out.status = EnrollStatus::BAD_CODE;  out.message = "Kode salah"; return out; }
  if (code == 422) { out.status = EnrollStatus::EXPIRED;   out.message = res["error"]["message"] | "Kode kedaluwarsa"; return out; }
  if (code >= 500) { out.status = EnrollStatus::SERVER_ERROR; out.message = "Server error"; return out; }
  if (code != 200 && code != 201) {
    out.status = EnrollStatus::SERVER_ERROR;
    out.message = String("HTTP ") + code;
    return out;
  }

  cfg.serverUrl     = serverUrl;
  cfg.deviceId      = String((const char *) res["device_id"]);
  cfg.secretHex     = String((const char *) res["secret"]);
  const char *labelC = res["label"] | (const char *) nullptr;
  cfg.deviceLabel   = labelC ? String(labelC) : String("");
  cfg.ibeaconUuid   = String((const char *) res["ibeacon"]["uuid"]);
  cfg.ibeaconMajor  = res["ibeacon"]["major"] | 0;
  cfg.ibeaconMinor  = res["ibeacon"]["minor"] | 0;
  cfg.intervalSec   = res["interval_rotasi_detik"] | DEFAULT_INTERVAL_SEC;
  cfg.beaconEnabled = res["beacon_broadcast_enabled"] | true;

  if (!cfg.isEnrolled()) {
    out.status = EnrollStatus::PARSE_ERROR;
    out.message = "Response kurang lengkap";
    return out;
  }

  storeSave(cfg);
  out.status = EnrollStatus::OK;
  out.message = "Enrollment sukses";
  return out;
}
