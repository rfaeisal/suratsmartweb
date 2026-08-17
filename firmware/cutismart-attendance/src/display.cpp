#include "display.h"
#include <TFT_eSPI.h>
#include <qrcode.h>
#include "config.h"

static TFT_eSPI tft;

// Layout landscape 320x240 (rotation 1 — USB kanan):
//
//   x: 0 ........................ 220 ....... 320
//   y: 0 +----------------------+---------+
//        |                      |  jam    |
//        |         QR           |  BLE    |
//        |       198x198        |  WiFi   |
//        |                      |  30s    |
//     210 +----------------------+---------+
//        |         Label device (font 4)   |
//     240 +--------------------------------+
#define SCREEN_W       320
#define SCREEN_H       240
#define PANEL_X        220
#define PANEL_W        (SCREEN_W - PANEL_X)
#define LABEL_BAR_Y    210
#define LABEL_BAR_H    (SCREEN_H - LABEL_BAR_Y)
#define QR_AREA_W      PANEL_X
#define QR_AREA_H      LABEL_BAR_Y

static String lastLabel;

void displayBegin() {
  tft.init();
  tft.setRotation(1); // landscape, USB di kanan
  tft.fillScreen(TFT_BLACK);
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);
  lastLabel = "";
}

void displayMessage(const String &title, const String &subtitle, uint16_t color) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(color, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.setTextFont(4);
  tft.drawString(title, SCREEN_W / 2, SCREEN_H / 2 - 15);
  if (subtitle.length() > 0) {
    tft.setTextFont(2);
    tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    tft.drawString(subtitle, SCREEN_W / 2, SCREEN_H / 2 + 20);
  }
  lastLabel = "";
}

void displayShowCaptivePortalHint(const String &ssid, const String &ipHint) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextFont(4);
  tft.drawString("SETUP MODE", SCREEN_W / 2, 30);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextFont(2);
  tft.drawString("Sambungkan HP ke WiFi:", SCREEN_W / 2, 70);
  tft.setTextFont(4);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString(ssid, SCREEN_W / 2, 100);

  tft.setTextFont(2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString("Lalu buka:", SCREEN_W / 2, 135);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString(ipHint, SCREEN_W / 2, 155);

  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawString("Isi WiFi + kode enroll dari admin panel.", SCREEN_W / 2, 200);
  lastLabel = "";
}

static void drawQrBitmap(QRCode &qr, int x, int y, int scale) {
  int side = qr.size * scale;
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

static void drawRightPanel(const DisplayState &state) {
  // Latar navy penuh
  tft.fillRect(PANEL_X, 0, PANEL_W, LABEL_BAR_Y, TFT_NAVY);

  int cx = PANEL_X + PANEL_W / 2;

  // Jam besar
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE, TFT_NAVY);
  tft.setTextFont(4);
  tft.drawString(state.clock, cx, 25);

  // BLE
  tft.setTextFont(2);
  tft.setTextColor(TFT_CYAN, TFT_NAVY);
  tft.drawString(state.bleStatus, cx, 75);

  // WiFi
  tft.setTextColor(state.wifiRssi < 0 ? TFT_GREEN : TFT_RED, TFT_NAVY);
  tft.drawString(state.wifiRssi < 0 ? "WiFi ON" : "WiFi OFF", cx, 110);

  // Countdown detik
  tft.setTextFont(4);
  tft.setTextColor(TFT_YELLOW, TFT_NAVY);
  tft.drawString(String(state.secondsLeft) + "s", cx, 170);
}

static void drawLabelBar(const DisplayState &state, bool force) {
  String label = state.deviceLabel.length() > 0 ? state.deviceLabel : state.deviceId;
  if (!force && label == lastLabel) return;
  lastLabel = label;

  tft.fillRect(0, LABEL_BAR_Y, SCREEN_W, LABEL_BAR_H, TFT_NAVY);

  // Font 4 ≈ 26 px, potong kalau kepanjangan (kira-kira 20 char muat)
  if (label.length() > 20) label = label.substring(0, 19) + "…";

  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE, TFT_NAVY);
  tft.setTextFont(4);
  tft.drawString(label, SCREEN_W / 2, LABEL_BAR_Y + LABEL_BAR_H / 2);
}

void displayRenderQr(const String &qrPayload, const DisplayState &state) {
  QRCode qr;
  uint8_t qrBuffer[qrcode_getBufferSize(4)];
  qrcode_initText(&qr, qrBuffer, 4, ECC_MEDIUM, qrPayload.c_str());
  int scale = 6;
  int side = qr.size * scale;
  int drawX = (QR_AREA_W - side) / 2;
  int drawY = (QR_AREA_H - side) / 2;

  tft.fillRect(0, 0, QR_AREA_W, QR_AREA_H, TFT_BLACK);
  drawQrBitmap(qr, drawX, drawY, scale);

  drawRightPanel(state);
  drawLabelBar(state, /*force=*/true);
}

void displayRefreshStatus(const DisplayState &state) {
  drawRightPanel(state);
  drawLabelBar(state, /*force=*/false);
}
