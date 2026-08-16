#include "timesync.h"
#include <time.h>
#include "config.h"

bool timesyncStart(uint32_t timeoutMs) {
  configTime(NTP_TZ_OFFSET_SEC, NTP_DST_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
  uint32_t start = millis();
  time_t now = 0;
  while (millis() - start < timeoutMs) {
    time(&now);
    if (now > 1700000000) return true; // >= 2023-11
    delay(200);
  }
  return false;
}

uint32_t nowEpoch() {
  time_t now = 0;
  time(&now);
  if (now < 1700000000) return 0;
  return (uint32_t) now;
}

String nowClockString() {
  time_t now = 0;
  time(&now);
  if (now < 1700000000) return "--:--";
  struct tm t;
  localtime_r(&now, &t);
  char buf[8];
  snprintf(buf, sizeof(buf), "%02d:%02d", t.tm_hour, t.tm_min);
  return String(buf);
}
