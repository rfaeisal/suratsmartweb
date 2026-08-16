#include "store.h"
#include <Preferences.h>
#include "config.h"

static Preferences prefs;
static const char *NS = "cutismart";

void storeBegin() {
  prefs.begin(NS, false);
}

bool storeLoad(DeviceConfig &cfg) {
  cfg.serverUrl      = prefs.getString("srv", "");
  cfg.deviceId       = prefs.getString("did", "");
  cfg.secretHex      = prefs.getString("sec", "");
  cfg.ibeaconUuid    = prefs.getString("buuid", "");
  cfg.ibeaconMajor   = prefs.getUShort("bmaj", 0);
  cfg.ibeaconMinor   = prefs.getUShort("bmin", 0);
  cfg.intervalSec    = prefs.getUShort("intv", DEFAULT_INTERVAL_SEC);
  cfg.beaconEnabled  = prefs.getBool("bcen", true);
  return cfg.isEnrolled();
}

bool storeSave(const DeviceConfig &cfg) {
  prefs.putString("srv", cfg.serverUrl);
  prefs.putString("did", cfg.deviceId);
  prefs.putString("sec", cfg.secretHex);
  prefs.putString("buuid", cfg.ibeaconUuid);
  prefs.putUShort("bmaj", cfg.ibeaconMajor);
  prefs.putUShort("bmin", cfg.ibeaconMinor);
  prefs.putUShort("intv", cfg.intervalSec);
  prefs.putBool("bcen", cfg.beaconEnabled);
  return true;
}

void storeSaveServerUrl(const String &url) { prefs.putString("srv", url); }
String storeLoadServerUrl() { return prefs.getString("srv", ""); }

void storeSaveEnrollCode(const String &code) { prefs.putString("ecode", code); }
String storeLoadEnrollCode() { return prefs.getString("ecode", ""); }
void storeClearEnrollCode() { prefs.remove("ecode"); }

void storeFactoryReset() {
  prefs.clear();
}
