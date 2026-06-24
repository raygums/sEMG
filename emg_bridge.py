"""
emg_bridge.py — Serial <-> Local API <-> Next.js bridge

Arsitektur "Web-Driven Labeling via Local Python API":

  [XIAO nRF52840] --Serial (satu arah, raw)--> [Bridge ini]
                                                      ^
                                                      | HTTP PUT /phase (localhost:8000)
                                                      |
                                          [Next.js SessionRunner.tsx, tiap rAF]

  [Bridge ini] --HTTP POST batch--> [Next.js /api/sessions/[id]/emg] --> PostgreSQL

Firmware TIDAK tahu apa-apa soal fase atau sesi. Firmware hanya mengirim baris
CSV/biner berisi 6 raw + 6 processed lewat Serial, terus-menerus, dari device
sampai komputer. Semua "kepintaran" (label fase, sampleIndex, transition guard,
batching ke DB) ada di sini.

Jalankan: python emg_bridge.py
Lalu di terminal lain biarkan Next.js dev server jalan seperti biasa.
"""

import asyncio
import json
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import requests
import serial
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ============================================
# Konfigurasi -- sesuaikan sebelum menjalankan
# ============================================

SERIAL_PORT = "COM5"           # ganti sesuai port XIAO nRF52840 Anda
SERIAL_BAUDRATE = 115200
NEXTJS_BASE_URL = "http://localhost:3000"
LOCAL_API_PORT = 8000

# Berapa banyak sample pertama setelah perubahan fase yang ditandai
# isTransition=True. Nilai ini PERLU disesuaikan setelah sampling rate
# aktual hardware terukur -- 5 adalah titik awal yang konservatif, belum
# divalidasi dengan hardware nyata.
TRANSITION_GUARD_SAMPLES = 5

# Kirim batch ke Next.js setiap kali buffer mencapai ukuran ini, ATAU
# setiap BATCH_FLUSH_INTERVAL_S detik, mana yang lebih dulu tercapai.
BATCH_SIZE = 50
BATCH_FLUSH_INTERVAL_S = 0.25

VALID_PHASES = {"PREPARATION", "ACTION", "REST"}


# ============================================
# State bersama antara Serial reader thread dan FastAPI server
# ============================================

@dataclass
class BridgeState:
    session_id: Optional[str] = None
    current_phase: str = "REST"
    transition_guard_remaining: int = 0
    sample_index: int = 0
    session_start_perf: Optional[float] = None  # time.perf_counter() saat SESSION_START
    lock: threading.Lock = field(default_factory=threading.Lock)

    def set_session(self, session_id: str):
        with self.lock:
            self.session_id = session_id
            self.sample_index = 0
            self.current_phase = "PREPARATION"
            self.transition_guard_remaining = TRANSITION_GUARD_SAMPLES
            self.session_start_perf = time.perf_counter()
            print(f"[bridge] Sesi dimulai: {session_id}")

    def end_session(self):
        with self.lock:
            print(f"[bridge] Sesi berakhir: {self.session_id}")
            self.session_id = None
            self.session_start_perf = None

    def update_phase(self, phase: str):
        with self.lock:
            if phase != self.current_phase:
                self.current_phase = phase
                self.transition_guard_remaining = TRANSITION_GUARD_SAMPLES

    def next_sample_meta(self) -> Optional[dict]:
        """Ambil metadata (sampleIndex, elapsedMs, phase, isTransition) untuk
        satu sample baru yang baru tiba dari Serial. Return None jika tidak
        ada sesi aktif (sample dibuang)."""
        with self.lock:
            if self.session_id is None or self.session_start_perf is None:
                return None

            elapsed_ms = int((time.perf_counter() - self.session_start_perf) * 1000)
            is_transition = self.transition_guard_remaining > 0
            if is_transition:
                self.transition_guard_remaining -= 1

            meta = {
                "sampleIndex": self.sample_index,
                "elapsedMs": elapsed_ms,
                "phase": self.current_phase,
                "isTransition": is_transition,
            }
            self.sample_index += 1
            return meta


state = BridgeState()
batch_buffer: deque = deque()
batch_lock = threading.Lock()


# ============================================
# Local API server (FastAPI) -- dipanggil oleh Next.js SessionRunner
# ============================================

app = FastAPI()

# Browser menganggap localhost:3000 (Next.js) dan localhost:8000 (bridge ini)
# sebagai origin yang BERBEDA meski sama-sama "localhost" -- tanpa CORS
# middleware ini, browser akan blokir fetch() dari SessionRunner.tsx sebelum
# request sempat terkirim (muncul sebagai "Failed to fetch" / CORS error di
# console, dan bisa memicu ConnectionResetError di sisi server saat browser
# membatalkan koneksi yang baru terbuka).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # sesuaikan kalau Next.js jalan di port lain
    allow_methods=["*"],
    allow_headers=["*"],
)


class SessionStartRequest(BaseModel):
    sessionId: str


class PhaseUpdateRequest(BaseModel):
    sessionId: str
    phase: str


@app.post("/session/start")
def session_start(req: SessionStartRequest):
    state.set_session(req.sessionId)
    return {"ok": True}


@app.post("/session/end")
def session_end():
    flush_batch(force=True)
    state.end_session()
    return {"ok": True}


@app.put("/phase")
def phase_update(req: PhaseUpdateRequest):
    """Dipanggil oleh Next.js SessionRunner.tsx setiap rAF tick (di-throttle
    di sisi Next.js supaya tidak spam -- lihat catatan di SessionRunner.tsx).
    Hanya benar-benar mengubah state kalau sessionId cocok dan phase valid,
    supaya event basi dari sesi lama yang telat sampai tidak salah ubah state."""
    if req.sessionId != state.session_id:
        return {"ok": False, "reason": "sessionId tidak cocok dengan sesi aktif di bridge"}
    if req.phase not in VALID_PHASES:
        return {"ok": False, "reason": f"phase '{req.phase}' tidak dikenal"}

    state.update_phase(req.phase)
    return {"ok": True, "currentPhase": state.current_phase}


@app.get("/health")
def health():
    return {
        "ok": True,
        "sessionId": state.session_id,
        "currentPhase": state.current_phase,
        "bufferSize": len(batch_buffer),
    }


# ============================================
# Serial reader -- format baris yang diharapkan dari firmware:
#   r1,r2,r3,r4,r5,r6,p1,p2,p3,p4,p5,p6\n
# (12 angka float dipisah koma -- firmware TIDAK mengirim apa pun soal
# fase/sesi/timestamp; itu semua urusan bridge ini)
# ============================================

LINE_PATTERN = re.compile(
    r"^(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),"
    r"(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)$"
)


def parse_serial_line(line: str) -> Optional[dict]:
    match = LINE_PATTERN.match(line.strip())
    if not match:
        return None
    r1, r2, r3, r4, r5, r6, p1, p2, p3, p4, p5, p6 = (float(g) for g in match.groups())
    return {
        "r1": r1, "r2": r2, "r3": r3, "r4": r4, "r5": r5, "r6": r6,
        "p1": p1, "p2": p2, "p3": p3, "p4": p4, "p5": p5, "p6": p6,
    }


def flush_batch(force: bool = False):
    with batch_lock:
        if not batch_buffer:
            return
        if not force and len(batch_buffer) < BATCH_SIZE:
            return
        to_send = list(batch_buffer)
        batch_buffer.clear()

    session_id = state.session_id
    if session_id is None:
        # Sesi sudah berakhir di antara sample masuk dan flush -- buang batch
        # ini daripada salah kirim ke sesi yang sudah tidak ada.
        print(f"[bridge] Buang {len(to_send)} sample karena sesi sudah berakhir")
        return

    try:
        resp = requests.post(
            f"{NEXTJS_BASE_URL}/api/sessions/{session_id}/emg",
            json={"samples": to_send},
            timeout=5,
        )
        if resp.status_code != 201:
            print(f"[bridge] Gagal kirim batch ({resp.status_code}): {resp.text}")
        else:
            print(f"[bridge] Terkirim {len(to_send)} sample -> {resp.json()}")
    except requests.RequestException as e:
        print(f"[bridge] Error koneksi ke Next.js: {e}")
        # NOTE: belum ada retry/buffer-ke-disk di sini. Kalau Next.js down
        # sesaat, batch ini HILANG. Pertimbangkan menambah local buffering
        # ke file (misal JSONL) sebelum dipakai untuk pengambilan data
        # sungguhan, supaya tidak kehilangan data kalau dev server restart.


def serial_reader_loop():
    print(f"[bridge] Membuka Serial port {SERIAL_PORT} @ {SERIAL_BAUDRATE}...")
    ser = serial.Serial(SERIAL_PORT, SERIAL_BAUDRATE, timeout=1)
    last_flush = time.perf_counter()

    while True:
        raw_line = ser.readline().decode("utf-8", errors="ignore")
        if not raw_line:
            pass  # timeout baca, lanjut loop (juga jadi titik cek flush interval)
        else:
            sample_values = parse_serial_line(raw_line)
            if sample_values is None:
                print(f"[bridge] Baris Serial tidak cocok format, dilewati: {raw_line!r}")
            else:
                meta = state.next_sample_meta()
                if meta is not None:
                    with batch_lock:
                        batch_buffer.append({**meta, **sample_values})

        now = time.perf_counter()
        if now - last_flush >= BATCH_FLUSH_INTERVAL_S:
            flush_batch(force=False)
            last_flush = now
        else:
            flush_batch(force=False)  # no-op kalau belum capai BATCH_SIZE


def run_local_api():
    uvicorn.run(app, host="127.0.0.1", port=LOCAL_API_PORT, log_level="warning")


if __name__ == "__main__":
    api_thread = threading.Thread(target=run_local_api, daemon=True)
    api_thread.start()
    print(f"[bridge] Local API server jalan di http://127.0.0.1:{LOCAL_API_PORT}")

    try:
        serial_reader_loop()
    except KeyboardInterrupt:
        print("\n[bridge] Dihentikan oleh pengguna, flush sisa buffer...")
        flush_batch(force=True)