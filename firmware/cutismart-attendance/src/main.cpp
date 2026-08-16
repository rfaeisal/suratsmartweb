#include <Arduino.h>
#include <WiFi.h>
#include "config.h"
#include "store.h"
#include "display.h"
#include "provision.h"
#include "enroll.h"
#include "timesync.h"
#include "qrtoken.h"
#include "beacon.h"

static DeviceConfig cfg;

// State ---
enum class State { BOOT, PROVISION, WIFI, NTP, ENROLL, RUN, ERROR };
static State state = State::BOOT;
static String pendingEnrollCode;

// Untuk rotasi & redraw
static uint64_t lastCounter = 0;
static uint32_t lastTick = 0;
static uint32_t lastFooterTick = 0;

// Tombol reset (long press)
static uint32_t buttonHeldSince = 0;
static bool buttonWasPressed = false;

static void handleFactoryResetButton() {
  bool pressed = digitalRead(BUTTON_RESET_PIN) == LOW;
  uint32_t now = millis();
  if (pressed) {
    if (!buttonWasPressed) {
      buttonWasPressed = true;
      buttonHeldSince = now;
    } else if (now - buttonHeldSince > BUTTON_RESET_HOLD_MS) {
      Serial.println("[main] Factory reset");
      displayMessage("RESET…", "Menghapus konfigurasi", TFT_RED);
      storeFactoryReset();
      delay(1500);
      ESP.restart();
    }
  } else {
    buttonWasPressed = false;
    buttonHeldSince = 0;
  }
}

static void enterProvision() {
  displayShowCaptivePortalHint(AP_SSID, "http://192.168.4.1");
  String currentServer = storeLoadServerUrl();
  if (currentServer.length() == 0) currentServer = "https://cuti.appsmart.my.id";
  ProvisionResult r = provisionWiFiCaptive(currentServer);
  if (r.serverUrl.length() > 0) storeSaveServerUrl(r.serverUrl);
  if (r.enrollCode.length() > 0) storeSaveEnrollCode(r.enrollCode);
  // Setelah portal selesai, WiFi harusnya sudah connected
  state = State::NTP;
}

static void doEnrollIfNeeded() {
  if (cfg.isEnrolled()) return;

  String code = storeLoadEnrollCode();
  String url = storeLoadServerUrl();
  if (code.length() == 0 || url.length() == 0) {
    Serial.println("[main] Belum ada kode enroll — kembali ke provisioning");
    displayMessage("Enroll dibutuhkan", "Sambungkan ke " AP_SSID, TFT_YELLOW);
    delay(2000);
    state = State::PROVISION;
    return;
  }

  displayMessage("Enroll…", code, TFT_CYAN);
  EnrollOutcome out = enrollDevice(url, code, cfg);
  storeClearEnrollCode();

  if (out.status == EnrollStatus::OK) {
    displayMessage("Enroll OK", cfg.deviceId, TFT_GREEN);
    delay(1500);
    state = State::RUN;
    return;
  }

  Serial.printf("[main] Enroll gagal: %s\n", out.message.c_str());
  displayMessage("Enroll gagal", out.message, TFT_RED);
  delay(3000);
  state = State::PROVISION;
}

static void enterRun() {
  if (cfg.beaconEnabled && cfg.ibeaconUuid.length() > 0) {
    beaconStart(cfg.ibeaconUuid, cfg.ibeaconMajor, cfg.ibeaconMinor);
  }
  lastCounter = 0;
  lastTick = 0;
}

static void runTick() {
  uint32_t now = millis();
  if (now - lastTick < TICK_INTERVAL_MS) return;
  lastTick = now;

  uint32_t epoch = nowEpoch();
  if (epoch == 0) {
    displayMessage("Waktu belum sync", "", TFT_YELLOW);
    state = State::NTP;
    return;
  }

  uint64_t counter = 0;
  String token = buildQrToken(cfg.deviceId, cfg.secretHex, epoch, cfg.intervalSec, counter);

  DisplayState ds;
  ds.deviceLabel = cfg.deviceId; // gunakan deviceId; nama humane belum di-sync
  ds.deviceId = cfg.deviceId;
  ds.clock = nowClockString();
  ds.wifiRssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
  ds.intervalSec = cfg.intervalSec;
  ds.secondsLeft = cfg.intervalSec - (epoch % cfg.intervalSec);
  ds.bleStatus = beaconIsAdvertising() ? "BLE ON" : "BLE OFF";

  if (counter != lastCounter) {
    displayRenderQr(token, ds);
    lastCounter = counter;
    lastFooterTick = now;
    return;
  }

  // Refresh header/footer (jam + countdown) ~1x/detik tanpa redraw QR (anti-flicker)
  if (now - lastFooterTick > 1000) {
    lastFooterTick = now;
    displayRefreshStatus(ds);
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.printf("\n[cutismart-attendance] v%s boot\n", FIRMWARE_VERSION);

  pinMode(BUTTON_RESET_PIN, INPUT_PULLUP);

  storeBegin();
  displayBegin();
  displayMessage("CutiSmart", String("v") + FIRMWARE_VERSION, TFT_CYAN);
  delay(700);

  storeLoad(cfg);

  // Coba pakai WiFi tersimpan dulu
  displayMessage("Menghubungkan WiFi", "", TFT_WHITE);
  if (tryConnectSavedWiFi(15000)) {
    state = State::NTP;
  } else {
    state = State::PROVISION;
  }
}

void loop() {
  handleFactoryResetButton();

  switch (state) {
    case State::PROVISION:
      enterProvision();
      break;

    case State::NTP: {
      displayMessage("Sinkron waktu…", "NTP", TFT_WHITE);
      if (!timesyncStart(30000)) {
        displayMessage("Waktu gagal", "Cek koneksi internet", TFT_RED);
        delay(3000);
        state = State::PROVISION;
        return;
      }
      state = cfg.isEnrolled() ? State::RUN : State::ENROLL;
      if (state == State::RUN) enterRun();
      break;
    }

    case State::ENROLL:
      doEnrollIfNeeded();
      if (state == State::RUN) enterRun();
      break;

    case State::RUN:
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[main] WiFi disconnected, retry");
        WiFi.reconnect();
      }
      runTick();
      break;

    case State::BOOT:
    case State::ERROR:
      delay(100);
      break;
  }

  delay(20);
}
