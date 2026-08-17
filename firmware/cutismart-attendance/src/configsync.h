#pragma once
#include <Arduino.h>
#include "store.h"

// Sinkron ringan ke server: ambil label & flag config yang bisa berubah
// dari admin panel tanpa perlu re-enroll. Update cfg + NVS bila berubah.
// Return true kalau ada perubahan yang mengubah tampilan.
bool configSync(DeviceConfig &cfg);
