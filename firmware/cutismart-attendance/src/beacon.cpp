#include "beacon.h"
#include <NimBLEDevice.h>
#include <NimBLEBeacon.h>

static bool advertising = false;

static bool parseUuidHex(const String &s, uint8_t out[16]) {
  int i = 0, j = 0;
  auto hexVal = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  while (i < (int) s.length() && j < 16) {
    char c1 = s.charAt(i++);
    if (c1 == '-') continue;
    if (i >= (int) s.length()) return false;
    char c2 = s.charAt(i++);
    int v1 = hexVal(c1), v2 = hexVal(c2);
    if (v1 < 0 || v2 < 0) return false;
    out[j++] = (uint8_t) ((v1 << 4) | v2);
  }
  return j == 16;
}

void beaconStart(const String &uuidStr, uint16_t major, uint16_t minor, int8_t txPower) {
  uint8_t uuidBytes[16];
  if (!parseUuidHex(uuidStr, uuidBytes)) {
    Serial.printf("[beacon] UUID tidak valid: %s\n", uuidStr.c_str());
    return;
  }

  if (!NimBLEDevice::getInitialized()) {
    NimBLEDevice::init("");
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  }

  NimBLEBeacon beacon;
  NimBLEUUID uuid(uuidBytes, 16, true);
  beacon.setManufacturerId(0x004C); // Apple
  beacon.setProximityUUID(uuid);
  beacon.setMajor(major);
  beacon.setMinor(minor);
  beacon.setSignalPower(txPower);

  NimBLEAdvertisementData advData;
  advData.setFlags(0x04); // BR_EDR_NOT_SUPPORTED
  // NimBLEBeacon::getData() sudah mengandung manufacturer id Apple (0x4C 0x00)
  // di awalnya, jadi jangan prepend lagi — kalau di-prepend, packet iBeacon rusak
  // dan scanner tidak mengenalinya sebagai iBeacon.
  advData.setManufacturerData(beacon.getData());

  NimBLEAdvertising *pAdv = NimBLEDevice::getAdvertising();
  pAdv->stop();
  pAdv->setAdvertisementData(advData);
  pAdv->setScanResponse(false);
  pAdv->setMinInterval(0x00A0); // 100ms
  pAdv->setMaxInterval(0x00A0);
  pAdv->start();
  advertising = true;
  Serial.printf("[beacon] Advertising %s / %u / %u @ %d dBm\n", uuidStr.c_str(), major, minor, txPower);
}

void beaconStop() {
  if (!NimBLEDevice::getInitialized()) return;
  NimBLEDevice::getAdvertising()->stop();
  advertising = false;
}

bool beaconIsAdvertising() { return advertising; }
