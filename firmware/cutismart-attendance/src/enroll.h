#pragma once
#include <Arduino.h>
#include "store.h"

enum class EnrollStatus { OK, NETWORK_ERROR, BAD_CODE, EXPIRED, SERVER_ERROR, PARSE_ERROR };

struct EnrollOutcome {
  EnrollStatus status;
  String message;
};

// Post ke {serverUrl}/api/v1/devices/enroll dengan enrollCode.
// Kalau OK, cfg diisi dan disimpan ke NVS.
EnrollOutcome enrollDevice(const String &serverUrl, const String &enrollCode, DeviceConfig &cfg);
