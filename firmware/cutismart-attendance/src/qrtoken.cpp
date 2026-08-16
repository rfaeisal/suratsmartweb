#include "qrtoken.h"
#include "mbedtls/md.h"

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

static String u64ToDec(uint64_t v) {
  char buf[24];
  // uint64_t decimal manual (Arduino String tidak support 64-bit langsung)
  int i = sizeof(buf);
  buf[--i] = 0;
  if (v == 0) { buf[--i] = '0'; }
  while (v > 0 && i > 0) {
    buf[--i] = '0' + (v % 10);
    v /= 10;
  }
  return String(&buf[i]);
}

String buildQrToken(const String &deviceId, const String &secretHex, uint32_t epoch, uint16_t intervalSec, uint64_t &outCounter) {
  if (intervalSec == 0) intervalSec = 30;
  uint64_t counter = (uint64_t) epoch / (uint64_t) intervalSec;
  outCounter = counter;
  String counterStr = u64ToDec(counter);

  String msg = deviceId + counterStr;

  uint8_t digest[32];
  const mbedtls_md_info_t *md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, md, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char *) secretHex.c_str(), secretHex.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char *) msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, digest);
  mbedtls_md_free(&ctx);

  String hmacHex = hexEncode(digest, 32);
  String hmac8 = hmacHex.substring(0, 8);
  return deviceId + "|" + counterStr + "|" + hmac8;
}
