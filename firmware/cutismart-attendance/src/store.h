#pragma once
#include <Arduino.h>

struct DeviceConfig {
  String serverUrl;      // https://cuti.appsmart.my.id
  String deviceId;       // 12 hex chars
  String secretHex;      // 64 hex chars (32 bytes HMAC key)
  String deviceLabel;    // nama humane dari admin panel (fallback deviceId)
  String ibeaconUuid;    // 8-4-4-4-12
  uint16_t ibeaconMajor; // 0..65535
  uint16_t ibeaconMinor; // 0..65535
  uint16_t intervalSec;  // rotasi QR
  bool beaconEnabled;    // broadcast iBeacon?

  bool isEnrolled() const {
    return deviceId.length() > 0 && secretHex.length() > 0;
  }
};

void storeBegin();
bool storeLoad(DeviceConfig &cfg);
bool storeSave(const DeviceConfig &cfg);
void storeSaveServerUrl(const String &url);
String storeLoadServerUrl();
void storeSaveEnrollCode(const String &code);
String storeLoadEnrollCode();
void storeClearEnrollCode();
void storeFactoryReset();
