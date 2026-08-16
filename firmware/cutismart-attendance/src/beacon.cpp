#include "beacon.h"
#include <NimBLEDevice.h>
#include <string.h>

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

  // Build iBeacon manufacturer data manually (25 bytes) — bypass NimBLEBeacon
  // helper karena setter-nya double-swap Apple company id, yang bikin bytes
  // di udara jadi [0x00, 0x4C] (big-endian) — melanggar BLE spec dan bikin
  // scanner (Android BluetoothLeScanner, iOS CoreBluetooth) tidak mengenali
  // sebagai Apple/iBeacon.
  uint8_t payload[25];
  payload[0] = 0x4C; payload[1] = 0x00;       // Company ID Apple, little-endian on wire
  payload[2] = 0x02; payload[3] = 0x15;       // iBeacon sub-type + length
  memcpy(&payload[4], uuidBytes, 16);         // Proximity UUID (big-endian, MSB first)
  payload[20] = (uint8_t) ((major >> 8) & 0xFF);
  payload[21] = (uint8_t) (major & 0xFF);
  payload[22] = (uint8_t) ((minor >> 8) & 0xFF);
  payload[23] = (uint8_t) (minor & 0xFF);
  payload[24] = (uint8_t) txPower;

  NimBLEAdvertisementData advData;
  advData.setFlags(0x04); // BR_EDR_NOT_SUPPORTED
  advData.setManufacturerData(std::string((char*) payload, sizeof(payload)));

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
