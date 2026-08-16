#pragma once
#include <Arduino.h>

// Bangun token QR: "{deviceId}|{counter}|{hmacHex8}"
// counter = floor(epoch / intervalSec)
// hmacKey = secretHex (utf-8 bytes, TIDAK di-decode ke raw bytes — sesuai server)
// hmacMsg = deviceId + counterStr (desimal)
// output HMAC diambil 8 hex pertama (sama seperti server verifier).
String buildQrToken(const String &deviceId, const String &secretHex, uint32_t epoch, uint16_t intervalSec, uint64_t &outCounter);
