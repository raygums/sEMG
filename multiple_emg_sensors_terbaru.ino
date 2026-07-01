/*
  OYMotion-based EMG with Functionized Multi-Sensor Support
  - Keeps OYMotion filter chain and squared-envelope logic
  - Adds fixed 3 s auto-calibration of relaxed baseline per channel
  - Threshold = mean + K*std of relaxed envelope (capped by fraction of max)
  - Designed to scale from 1 to N sensors with minimal changes

  Board: Arduino Nano 33 BLE (nRF52840) or similar 3.3 V ADC
  Safety: Keep ADC <= 3.3 V. If your EMG module runs at 5 V, use 3.3 V supply (preferred)
          or a resistor divider + series resistor on the signal. Common ground required.
*/

#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

#include "EMGFilters.h"

// # Bluetooth
#include <ArduinoBLE.h>

// ==== BLE UUIDs (Nordic UART-style) ====
#define EMG_SERVICE_UUID      "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define EMG_CHAR_NOTIFY_UUID  "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

// BLE objects
BLEService emgService(EMG_SERVICE_UUID);
BLECharacteristic emgNotify(EMG_CHAR_NOTIFY_UUID, BLERead | BLENotify, 20);

const char* DEVICE_NAME = "EMG-Stream";   // name shown to PC/phone
const uint16_t BLE_RATE_HZ = 200;         // notify rate (100–250 Hz recommended)

// ============================ User Config ============================

// Number of EMG channels. Start with 1, expand to 6 when ready.
//#define NUM_SENSORS 1
 #define NUM_SENSORS 6

// Analog pins for each channel (edit if NUM_SENSORS > 1)
uint8_t PINS[NUM_SENSORS] = { A0, A1, A2, A3, A4, A5 };
// uint8_t PINS[NUM_SENSORS] = { 1, 2, 3, 4, 5, 6 };

// OYMotion filter sample rate: choose ONE and match delay at loop end.
// SAMPLE_FREQ_500HZ  -> delayMicroseconds(2000)
// SAMPLE_FREQ_1000HZ -> delayMicroseconds(1000)
SAMPLE_FREQUENCY sampleRate = SAMPLE_FREQ_1000HZ;

// Power-line notch (change to NOTCH_FREQ_60HZ if needed)
NOTCH_FREQUENCY humFreq = NOTCH_FREQ_50HZ;

// Auto-calibration: fixed 3 s relaxed baseline measurement
const unsigned long CAL_DURATION_MS = 10000;

// Sensitivity tuning (theory-backed)
// - threshold = mean + K_STD * std  (computed over relaxed envelope)
// - then capped to <= (MAX_FRACTION * maxEnvelope) to avoid rare spikes dominating
// - floored by MIN_THRESHOLD to avoid zero threshold on very quiet signals
const float K_STD = 1.0f;              // lower = more sensitive (try 1.0–1.5); higher = more robust (2–3)
const float MAX_FRACTION = 0.80f;      // cap threshold to <= 80% of max relaxed spike
const unsigned long MIN_THRESHOLD = 10;// small floor to avoid zero threshold

// Print raw/envelope stream continuously (1) or only events (0)
#define STREAM_ALWAYS 1

// ========================== Per-Channel State ========================

struct EMGChannel {
  uint8_t pin;

  // OYMotion filter instance per channel
  EMGFilters filter;

  // Calibration state
  bool calRunning = true;
  unsigned long calStartMs = 0;
  unsigned long maxEnvelope = 0;

  // Welford stats for mean/std
  double mean = 0.0;
  double m2   = 0.0;
  unsigned long count = 0;

  // Runtime
  unsigned long threshold = 0;
  unsigned long events = 0;

  // Event detector state (from original OYMotion getEMGCount, but per channel)
  long integralData = 0;
  long integralDataEve = 0;
  bool remainFlag = false;
  unsigned long timeMillis = 0;
  unsigned long timeBeginzero = 0;
  int  TimeStandard = 200;  // ms of quiet to declare burst end
};

// All channels
EMGChannel ch[NUM_SENSORS];

// ============================ Helpers ================================

// Initialize one channel (pin, filter, calibration start)
void initChannel(EMGChannel &c, uint8_t pin) {
  c.pin = pin;
  c.filter.init(sampleRate, humFreq, true, true, true);
  c.calRunning = true;
  c.calStartMs = millis();
  c.maxEnvelope = 0;
  c.mean = 0.0;
  c.m2 = 0.0;
  c.count = 0;
  c.threshold = 0;
  c.events = 0;

  c.integralData = 0;
  c.integralDataEve = 0;
  c.remainFlag = false;
  c.timeMillis = 0;
  c.timeBeginzero = 0;
  c.TimeStandard = 200;
}

// Single-sample process: read ADC, filter, make squared envelope (OYMotion style)
inline unsigned long sampleEnvelope(EMGChannel &c, int &rawOut) {
  int data = analogRead(c.pin);
  rawOut = data; // expose raw ADC reading (pre-filter) to caller for Serial streaming
  int filtered = c.filter.update(data);
  unsigned long env = (unsigned long)sq(filtered); // squared envelope as in OYMotion sample
  return env;
}

// Update calibration stats for one channel (Welford online)
inline void accumulateCal(EMGChannel &c, unsigned long env) {
  c.count++;
  double x = (double)env;
  double delta = x - c.mean;
  c.mean += delta / (double)c.count;
  c.m2   += delta * (x - c.mean);
  if (env > c.maxEnvelope) c.maxEnvelope = env;
}

// Finalize calibration -> compute threshold for one channel
void finishCalibration(EMGChannel &c) {
  double variance = (c.count > 1) ? (c.m2 / (double)(c.count - 1)) : 0.0;
  double sigma = sqrt(variance);

  unsigned long byStats = (unsigned long)(c.mean + K_STD * sigma);
  unsigned long byCap   = (unsigned long)(MAX_FRACTION * (double)c.maxEnvelope);

  unsigned long thr = (byStats < byCap ? byStats : byCap);
  if (thr < MIN_THRESHOLD) thr = MIN_THRESHOLD;

  c.threshold = thr;
  c.calRunning = false;
}

// OYMotion event counter logic, but bound to a channel's state
inline int countEvent(EMGChannel &c, unsigned long envelope) {
  c.integralDataEve = c.integralData;
  c.integralData += (long)envelope;

  if ((c.integralDataEve == c.integralData) && (c.integralDataEve != 0)) {
    c.timeMillis = millis();
    if (c.remainFlag) {
      c.timeBeginzero = c.timeMillis;
      c.remainFlag = false;
      return 0;
    }
    if ((c.timeMillis - c.timeBeginzero) > (unsigned long)c.TimeStandard) {
      c.integralDataEve = c.integralData = 0;
      return 1;
    }
    return 0;
  } else {
    c.remainFlag = true;
    return 0;
  }
}

// ============================ Arduino ===============================

void setup() {
  Serial.begin(115200);
  while (!Serial) { }
  delay(200);

  // Optional: 12-bit resolution on Nano 33 BLE
  #if defined(ARDUINO_ARCH_MBED) || defined(ARDUINO_ARDUINO_NANO33BLE) || defined(ESP32)
  analogReadResolution(12); // use 12-bit ADC resolution (0..4095) for nRF52840 | Arduino Uno only use 10 bit (0..1023) | C3, S2, S3 can use between 9-12 bit
#endif

  // Init each channel
  for (int i = 0; i < NUM_SENSORS; ++i) {
    initChannel(ch[i], PINS[i]);
  }

  // Serial.println("CALIBRATING, Relax and keep still for 3 seconds...");
  // Print a CSV header (informational only -- bridge parses data rows by
  // regex, not by this header). Columns: raw0..rawN-1, env0..envN-1.
  // Serial.print("raw0");
  // for (int i = 1; i < NUM_SENSORS; ++i) { Serial.print(",raw"); Serial.print(i); }
  // for (int i = 0; i < NUM_SENSORS; ++i) { Serial.print(",env"); Serial.print(i); }
  // Serial.println();

  // --- BLE init ---
if (!BLE.begin()) {
  // Serial.println("BLE init failed!");
  while (1) {}
}
BLE.setLocalName(DEVICE_NAME);
BLE.setAdvertisedService(emgService);
emgService.addCharacteristic(emgNotify);
BLE.addService(emgService);
BLE.advertise();
// Serial.println("BLE advertising...");

}

void loop() {
  unsigned long now = millis();
  bool anyCalRunning = false;

  // ===== per-channel processing =====
  unsigned long env[NUM_SENSORS];
  int raw[NUM_SENSORS];

  for (int i = 0; i < NUM_SENSORS; ++i) {
    // 1) Sample envelope (filter + square), also capture raw ADC reading
    env[i] = sampleEnvelope(ch[i], raw[i]);

    if (ch[i].calRunning) {
      anyCalRunning = true;

      // 2) During calibration: collect stats and stream envelopes so user can see them
      accumulateCal(ch[i], env[i]);

      #if STREAM_ALWAYS
        // print per-iteration envelope row for all channels (below)
      #endif

      // 3) Finish calibration after CAL_DURATION_MS
      if ((now - ch[i].calStartMs) >= CAL_DURATION_MS) {
        finishCalibration(ch[i]);
        // Serial.print("THRESHOLD_SET_CH"); Serial.print(i); Serial.print(",");
        // Serial.println(ch[i].threshold);
        // Serial.print("CALIBRATION_DONE_CH"); Serial.println(i);
      }

    } else {
      // 4) After calibration: zero small values (relaxed), detect events
      env[i] = (env[i] > ch[i].threshold) ? env[i] : 0;

      // Count burst events on this channel
      if (countEvent(ch[i], env[i])) {
        ch[i].events++;
        // Serial.print("EMG_num_CH"); Serial.print(i); Serial.print(": ");
        // Serial.println(ch[i].events);
      }
    }

    
  }

  // ===== streaming output =====
  // Format: r1,r2,r3,r4,r5,r6,p1,p2,p3,p4,p5,p6
  // (raw ADC pre-filter, lalu processed/envelope -- urutan ini HARUS cocok
  // dengan LINE_PATTERN regex di emg_bridge.py, jangan diubah sepihak)
  #if STREAM_ALWAYS
    Serial.print(raw[0]);
    for (int i = 1; i < NUM_SENSORS; ++i) { Serial.print(','); Serial.print(raw[i]); }
    for (int i = 0; i < NUM_SENSORS; ++i) { Serial.print(','); Serial.print(env[i]); }
    Serial.println();
  #endif

  // Bluetooth
  // --- BLE notify at fixed rate ---
static uint32_t bleNextUs = micros();
if ((int32_t)(micros() - bleNextUs) >= 0) {
  bleNextUs += (1000000UL / BLE_RATE_HZ);

  // Pack envelopes (uint16 little-endian per channel)
  uint8_t pkt[20];  
  int byteCount = 0;
  for (int i = 0; i < NUM_SENSORS; ++i) {
    uint16_t v = (env[i] > 65535UL) ? 65535U : (uint16_t)env[i];
    pkt[byteCount++] = (uint8_t)(v & 0xFF);
    pkt[byteCount++] = (uint8_t)((v >> 8) & 0xFF);
  }

  BLEDevice central = BLE.central();
  if (central && central.connected()) {
    emgNotify.writeValue(pkt, byteCount);
  }
}

  // ===== pacing to match filter sample rate =====
  // For SAMPLE_FREQ_1000HZ use 1000 us; for 500 Hz use 2000 us.
  if (sampleRate == SAMPLE_FREQ_1000HZ) {
    delayMicroseconds(1000);
  } else {
    delayMicroseconds(2000);
  }
}

/*
  Notes on design and tuning:
  - Calibration measures the relaxed envelope distribution for 3 s.
    We compute mean and std online (Welford) and set:
        threshold = min( mean + K_STD*std, MAX_FRACTION * maxEnvelope )
      then clamp to MIN_THRESHOLD.
    *Lower K_STD / higher MAX_FRACTION -> more sensitive (triggers easier).*
    *Higher K_STD / lower MAX_FRACTION -> more robust (ignores small noise).*

  - Event counting matches OYMotion's original integral-based burst detector,
    but we keep separate integrators per channel so multiple sensors work independently.

  - Output:
    * During calibration: streaming envelopes (uncut) so you can watch stability.
    * After calibration: thresholded envelopes (0 when relaxed), plus "EMG_num_CHi" lines on detected bursts.
    You can disable continuous streaming by setting STREAM_ALWAYS=0.

  - Scaling to 6 sensors:
    * Set NUM_SENSORS 6 and fill PINS with your analog pins (e.g., {A0,A1,A2,A3,A4,A5}).
    * Each channel gets its own filter, calibration, and detector state.

  - Sampling integrity:
    * Keep the delay consistent with the chosen OYMotion SAMPLE_FREQUENCY so the filter's cutoffs stay correct.
    * For tighter timing, replace delayMicroseconds with a micros()-based scheduler.
*/
