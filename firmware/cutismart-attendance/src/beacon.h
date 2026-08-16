#pragma once
#include <Arduino.h>

// Mulai advertise iBeacon (Apple/Locate spec). uuidStr = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".
// txPower default -59 (nilai measured @ 1m yang umum untuk kalibrasi RSSI).
void beaconStart(const String &uuidStr, uint16_t major, uint16_t minor, int8_t txPower = -59);

// Hentikan advertise (mis. saat beaconEnabled=false)
void beaconStop();

bool beaconIsAdvertising();
