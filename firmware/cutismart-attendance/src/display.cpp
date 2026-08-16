#include "display.h"
#include <TFT_eSPI.h>
#include <qrcode.h>
#include "config.h"

static TFT_eSPI tft;

// Layout portrait 240x320:
//   0..30  header (label + clock)
//   30..270 QR area (240 lebar, kotak 240x240)
//   270..320 footer status
#define HEADER_H 28
#define QR_TOP   30
#define QR_SIZE  240
#define FOOTER_Y 275

void displayBegin() {
  tft.init();
  tft.setRotation(0); // portrait
  tft.fillScreen(TFT_BLACK);
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);
}

void displayMessage(const String &title, const String &subtitle, uint16_t color) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(color, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.setTextFont(4);
  tft.drawString(title, 120, 140);
  if (subtitle.length() > 0) {
    tft.setTextFont(2);
    tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    tft.drawString(subtitle, 120, 175);
  }
}

void displayShowCaptivePortalHint(const String &ssid, const String &ipHint) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextFont(4);
  tft.drawString("SETUP MODE", 120, 40);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextFont(2);
  tft.drawString("Sambungkan HP ke WiFi:", 120, 90);
  tft.setTextFont(4);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString(ssid, 120, 120);

  tft.setTextFont(2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString("Lalu buka:", 120, 160);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString(ipHint, 120, 180);

  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawString("Isi WiFi + kode enroll", 120, 220);
  tft.drawString("dari admin panel.", 120, 240);
}

static void drawQrBitmap(QRCode &qr, int x, int y, int scale) {
  // Modul QR digambar sebagai kotak-kotak `scale`x`scale` piksel.
  int side = qr.size * scale;
  // Latar putih dulu (dengan quiet zone 4 modul di dalam area kotak QR)
  int quiet = 4 * scale;
  tft.fillRect(x - quiet, y - quiet, side + quiet * 2, side + quiet * 2, TFT_WHITE);
  for (int yy = 0; yy < qr.size; yy++) {
    for (int xx = 0; xx < qr.size; xx++) {
      if (qrcode_getModule(&qr, xx, yy)) {
        tft.fillRect(x + xx * scale, y + yy * scale, scale, scale, TFT_BLACK);
      }
    }
  }
}

static void drawHeader(const DisplayState &state) {
  tft.fillRect(0, 0, 240, HEADER_H, TFT_NAVY);
  tft.setTextColor(TFT_WHITE, TFT_NAVY);
  tft.setTextDatum(ML_DATUM);
  tft.setTextFont(2);
  String label = state.deviceLabel.length() > 0 ? state.deviceLabel : state.deviceId;
  if (label.length() > 20) label = label.substring(0, 19) + "…";
  tft.drawString(label, 6, HEADER_H / 2);

  tft.setTextDatum(MR_DATUM);
  tft.drawString(state.clock, 234, HEADER_H / 2);
}

static void drawFooter(const DisplayState &state) {
  tft.fillRect(0, FOOTER_Y - 5, 240, 320 - (FOOTER_Y - 5), TFT_BLACK);
  tft.setTextDatum(ML_DATUM);
  tft.setTextFont(2);
  tft.setTextColor(state.wifiRssi < 0 ? TFT_GREEN : TFT_RED, TFT_BLACK);
  tft.drawString(state.wifiRssi < 0 ? "WiFi" : "OFF", 6, FOOTER_Y + 10);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString(state.bleStatus, 60, FOOTER_Y + 10);

  tft.setTextDatum(MR_DATUM);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  String next = String(state.secondsLeft) + "s";
  tft.drawString(next, 234, FOOTER_Y + 10);
}

void displayRenderQr(const String &qrPayload, const DisplayState &state) {
  drawHeader(state);

  QRCode qr;
  uint8_t qrBuffer[qrcode_getBufferSize(4)];
  qrcode_initText(&qr, qrBuffer, 4, ECC_MEDIUM, qrPayload.c_str());
  int scale = 6;
  int drawX = (240 - qr.size * scale) / 2;
  int drawY = QR_TOP + (QR_SIZE - qr.size * scale) / 2;

  tft.fillRect(0, QR_TOP, 240, QR_SIZE, TFT_BLACK);
  drawQrBitmap(qr, drawX, drawY, scale);

  drawFooter(state);
}

void displayRefreshStatus(const DisplayState &state) {
  drawHeader(state);
  drawFooter(state);
}
