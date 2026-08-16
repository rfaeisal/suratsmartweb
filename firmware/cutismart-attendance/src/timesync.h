#pragma once
#include <Arduino.h>

// Konfigurasi NTP dan blok sampai epoch valid (>= 2024) atau timeout habis.
bool timesyncStart(uint32_t timeoutMs = 30000);

// Detik unix sekarang. 0 kalau belum sync.
uint32_t nowEpoch();

// Format waktu lokal HH:MM
String nowClockString();
