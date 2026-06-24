"""
EMG BLE Gateway (v2 - Continuous Recording + Auto-Reconnect)
=============================================================

Bridges the Seeed XIAO nRF52840 ("EMG-Stream" BLE peripheral) to the Next.js
EMG Acquisition app. Runs on a laptop/PC with Bluetooth 5.x, on the SAME
machine as the Next.js server (localhost) - so no clock-sync correction is
applied; `receivedAt` timestamps on the server are treated as ground truth.

Recording model: "Continuous Recording"
----------------------------------------
The gateway does NOT decide when to record based on phase (PREPARATION /
ACTION / REST). Instead:
  - It listens to the Web app's SSE trigger stream (/api/trigger).
  - On a SESSION_START event whose sessionId matches --session-id,
    is_recording is set True and stays True through every phase and
    repetition.
  - On SESSION_END or SESSION_ABORT for that session, is_recording is set
    False again.
This means EmgSample rows span PREPARATION -> ACTION -> REST continuously;
segmentation into phases happens later in preprocessing by joining on
EventLog.timestamp ranges (see segmentation note at the bottom of this file).

Connectivity & pause-on-disconnect
-----------------------------------
If the BLE connection drops mid-session, this gateway:
  1. Immediately POSTs {"status": "disconnected"} to
     /api/sessions/{id}/gateway-status, which opens a GatewayEvent row.
  2. Retries connecting in a loop (with backoff) until it succeeds.
  3. POSTs {"status": "reconnected"} once back online, closing that
     GatewayEvent row.
SessionRunner polls gateway-status and PAUSES the phase timeline (freezes
the countdown) while connected=false, so no repetition runs "blind" without
sensor data.

Install:
    pip install bleak httpx --break-system-packages

Run:
    python emg_gateway.py --session-id <SESSION_ID> --api-base http://localhost:3000

You get <SESSION_ID> by creating a session in the web app first (e.g. via
the /session flow) and copying its id - the gateway does NOT create
sessions, it only appends EMG samples to an existing one.
"""

import argparse
import asyncio
import struct
import sys
from collections import deque

import httpx
from bleak import BleakClient, BleakScanner
from bleak.backends.characteristic import BleakGATTCharacteristic

# ---- Must match the firmware exactly ----
DEVICE_NAME = "EMG-Stream"
NOTIFY_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
NUM_CHANNELS = 6
# Packet: uint32 timestamp_us + 6x(float raw + float envelope) = 4 + 6*8 = 52 bytes
PACKET_STRUCT = struct.Struct("<I" + "ff" * NUM_CHANNELS)
EXPECTED_PACKET_SIZE = PACKET_STRUCT.size  # 52

# Batch samples for this long before POSTing, to avoid hammering the API at
# 200 Hz. 250ms batches at 200Hz -> ~50 samples per POST.
FLUSH_INTERVAL_S = 0.25

# Reconnect backoff: start small, cap at this many seconds between attempts.
RECONNECT_BACKOFF_START_S = 1.0
RECONNECT_BACKOFF_MAX_S = 10.0


def decode_packet(data: bytes):
    """Decode one BLE notification into a sample dict, or None if malformed."""
    if len(data) != EXPECTED_PACKET_SIZE:
        print(f"WARN: unexpected packet size {len(data)} (expected {EXPECTED_PACKET_SIZE}), dropping", file=sys.stderr)
        return None

    unpacked = PACKET_STRUCT.unpack(data)
    timestamp_us = unpacked[0]
    rest = unpacked[1:]
    raw = list(rest[0::2])
    envelope = list(rest[1::2])

    return {
        "deviceTimestampUs": timestamp_us,
        "raw": raw,
        "envelope": envelope,
    }


class EmgGateway:
    def __init__(self, api_base: str, session_id: str):
        self.api_base = api_base.rstrip("/")
        self.session_id = session_id
        self.buffer: deque = deque()
        self.http = httpx.AsyncClient(timeout=10.0)
        self.sample_count = 0
        self.dropped_count = 0

        # Continuous Recording gate: only True between SESSION_START and
        # SESSION_END/SESSION_ABORT for THIS session, as reported via SSE.
        self.is_recording = False

        # Tracks whether we currently believe the BLE link is up, so we only
        # report "disconnected"/"reconnected" transitions once each (not on
        # every retry attempt).
        self.ble_connected = False
        self._reported_disconnected = False

        # If True, never call report_disconnected (useful when hardware is
        # absent / in testing; session timeline won't be frozen).
        self.no_freeze = False

    # ---- BLE sample handling ----

    def on_notify(self, _char: BleakGATTCharacteristic, data: bytearray):
        sample = decode_packet(bytes(data))
        if sample is None:
            self.dropped_count += 1
            return
        if not self.is_recording:
            # Continuous Recording is gated by SESSION_START/END from the
            # Web app; outside that window we discard samples (e.g. before
            # the operator presses "Mulai Sesi", or after the session ends).
            return
        self.buffer.append(sample)
        self.sample_count += 1

    async def flush_loop(self):
        """Periodically POST buffered samples to the Next.js API."""
        url = f"{self.api_base}/api/sessions/{self.session_id}/emg"
        while True:
            await asyncio.sleep(FLUSH_INTERVAL_S)
            if not self.buffer:
                continue

            batch = list(self.buffer)
            self.buffer.clear()

            try:
                resp = await self.http.post(url, json=batch)
                if resp.status_code >= 400:
                    print(f"ERROR posting batch: {resp.status_code} {resp.text}", file=sys.stderr)
                    self.buffer.extendleft(reversed(batch))
            except httpx.HTTPError as e:
                print(f"ERROR posting batch (network): {e}", file=sys.stderr)
                self.buffer.extendleft(reversed(batch))

    async def status_loop(self):
        """Print a small heartbeat so you can see the gateway is alive."""
        last_count = 0
        while True:
            await asyncio.sleep(2.0)
            rate = (self.sample_count - last_count) / 2.0
            last_count = self.sample_count
            print(
                f"[gateway] recording={self.is_recording} ble_connected={self.ble_connected} "
                f"samples_total={self.sample_count} rate~={rate:.1f}/s "
                f"buffered={len(self.buffer)} dropped={self.dropped_count}"
            )

    async def trigger_listener(self):
        """Listen to the session runner's SSE trigger stream and gate
        is_recording based on SESSION_START / SESSION_END / SESSION_ABORT
        events that match our --session-id."""
        url = f"{self.api_base}/api/trigger"
        while True:
            try:
                async with self.http.stream("GET", url) as resp:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        await self._handle_trigger_line(line[6:])
            except httpx.HTTPError as e:
                print(f"WARN: trigger stream disconnected ({e}), retrying in 3s", file=sys.stderr)
                await asyncio.sleep(3)

    async def _handle_trigger_line(self, raw_json: str):
        import json
        try:
            event = json.loads(raw_json)
        except json.JSONDecodeError:
            return

        event_type = event.get("type")
        event_session_id = event.get("sessionId")

        if event_session_id != self.session_id:
            # Ignore events for other sessions (e.g. if multiple sessions
            # were created during testing). CONNECTED has no sessionId and
            # is just the initial SSE handshake message - ignore it too.
            if event_type not in ("CONNECTED",):
                pass
            return

        if event_type == "SESSION_START":
            self.is_recording = True
            print(f"[trigger] SESSION_START for {self.session_id} -> recording ON")
        elif event_type in ("SESSION_END", "SESSION_ABORT"):
            self.is_recording = False
            print(f"[trigger] {event_type} for {self.session_id} -> recording OFF")
        else:
            # PHASE_PREPARATION / PHASE_ACTION / PHASE_REST etc. - informational
            # only in Continuous Recording mode; segmentation happens later
            # in preprocessing via EventLog, not here.
            print(f"[trigger] {event_type} rep={event.get('repetitionNum')}")

    # ---- Connectivity reporting ----

    async def report_disconnected(self, note: str = ""):
        if self._reported_disconnected:
            return
        if self.no_freeze:
            print(f"[gateway-status] skip report_disconnected (--no-freeze-on-disconnect active)")
            return
        self._reported_disconnected = True
        self.ble_connected = False
        url = f"{self.api_base}/api/sessions/{self.session_id}/gateway-status"
        try:
            await self.http.post(url, json={"status": "disconnected", "note": note})
            print(f"[gateway-status] reported disconnected ({note})")
        except httpx.HTTPError as e:
            print(f"WARN: failed to report disconnected status: {e}", file=sys.stderr)

    async def report_reconnected(self):
        self.ble_connected = True
        if not self._reported_disconnected:
            # We never reported a disconnect (e.g. first connect at startup),
            # nothing to close.
            return
        self._reported_disconnected = False
        url = f"{self.api_base}/api/sessions/{self.session_id}/gateway-status"
        try:
            await self.http.post(url, json={"status": "reconnected"})
            print("[gateway-status] reported reconnected")
        except httpx.HTTPError as e:
            print(f"WARN: failed to report reconnected status: {e}", file=sys.stderr)

    async def close(self):
        await self.http.aclose()


async def find_device(timeout: float = 10.0):
    print(f"Scanning for BLE device named '{DEVICE_NAME}' ({timeout}s)...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=timeout)
    if device is None:
        print(f"Could not find a device named '{DEVICE_NAME}'. Is the XIAO powered on and advertising?", file=sys.stderr)
    return device


async def connect_and_stream(gateway: EmgGateway, scan_timeout: float) -> None:
    """Find the device, connect, subscribe, and block until disconnected.
    Raises/returns normally on disconnect so the caller's reconnect loop
    can retry. Does NOT manage flush_loop/status_loop/trigger_listener -
    those run independently for the lifetime of the whole script."""
    device = await find_device(timeout=scan_timeout)
    if device is None:
        raise ConnectionError(f"Device '{DEVICE_NAME}' not found during scan")

    print(f"Found device: {device.name} [{device.address}]")

    disconnect_event = asyncio.Event()

    def on_disconnect(_client: BleakClient):
        disconnect_event.set()

    async with BleakClient(device, timeout=20.0, disconnected_callback=on_disconnect) as client:
        print(f"Connected. Negotiated MTU: {client.mtu_size}")
        if client.mtu_size < EXPECTED_PACKET_SIZE + 3:
            print(
                f"WARN: negotiated MTU ({client.mtu_size}) may be too small for "
                f"{EXPECTED_PACKET_SIZE}-byte packets. The OS/adapter ultimately "
                f"decides the final negotiated MTU.",
                file=sys.stderr,
            )

        await client.start_notify(NOTIFY_CHAR_UUID, gateway.on_notify)
        await gateway.report_reconnected()
        print(f"Subscribed to {NOTIFY_CHAR_UUID}. Gateway ready (recording gated by SESSION_START/END).")

        # Block here until bleak's disconnected_callback fires.
        await disconnect_event.wait()
        print("BLE disconnected.")


async def reconnect_loop(gateway: EmgGateway, scan_timeout: float):
    """Keeps (re)connecting forever. Reports disconnected/reconnected status
    to the Web app around each gap so SessionRunner can pause/resume.

    IMPORTANT: on the very first scan attempt we do NOT report "disconnected"
    to the web app even if the scan fails, because the session timeline hasn't
    started yet (or the hardware simply isn't on yet). We only report
    disconnected after at least one successful connection has been made.
    """
    backoff = RECONNECT_BACKOFF_START_S
    first_attempt = True
    has_ever_connected = False

    while True:
        try:
            await connect_and_stream(gateway, scan_timeout)
            # connect_and_stream returned normally -> we just disconnected.
            has_ever_connected = True
            await gateway.report_disconnected(note="BLE link dropped (disconnected_callback)")
            backoff = RECONNECT_BACKOFF_START_S  # reset backoff after a successful session
        except (ConnectionError, asyncio.TimeoutError, OSError) as e:
            if has_ever_connected:
                # Only report disconnected if we were previously connected —
                # NOT on the initial failed scan (first_attempt or never connected).
                await gateway.report_disconnected(note=str(e))
            else:
                print(f"WARN: scan failed ({e}); will retry. Session timeline NOT frozen (never connected yet).")
            print(f"WARN: connection attempt failed ({e}); retrying in {backoff:.1f}s", file=sys.stderr)

        first_attempt = False
        await asyncio.sleep(backoff)
        backoff = min(backoff * 1.5, RECONNECT_BACKOFF_MAX_S)


async def run(api_base: str, session_id: str, scan_timeout: float, no_freeze: bool = False):
    gateway = EmgGateway(api_base, session_id)
    gateway.no_freeze = no_freeze

    if no_freeze:
        print("[gateway] --no-freeze-on-disconnect: session timeline will NOT be frozen on BLE disconnect")

    background_tasks = [
        asyncio.create_task(gateway.flush_loop()),
        asyncio.create_task(gateway.status_loop()),
        asyncio.create_task(gateway.trigger_listener()),
    ]

    try:
        await reconnect_loop(gateway, scan_timeout)
    except asyncio.CancelledError:
        pass
    finally:
        for t in background_tasks:
            t.cancel()
        await gateway.close()

    return 0


def main():
    parser = argparse.ArgumentParser(description="EMG BLE -> Next.js gateway (Continuous Recording)")
    parser.add_argument("--session-id", required=True, help="Session ID from the EMG Acquisition app")
    parser.add_argument("--api-base", default="http://localhost:3000", help="Base URL of the Next.js app (default: http://localhost:3000)")
    parser.add_argument("--scan-timeout", type=float, default=10.0, help="BLE scan timeout in seconds, per attempt")
    parser.add_argument(
        "--no-freeze-on-disconnect",
        action="store_true",
        default=False,
        help="If set, gateway will NOT report disconnect to web app, so session timeline won't freeze. "
             "Useful when hardware is absent or for dry-run testing.",
    )
    args = parser.parse_args()

    try:
        exit_code = asyncio.run(run(args.api_base, args.session_id, args.scan_timeout, args.no_freeze_on_disconnect))
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
        exit_code = 0

    sys.exit(exit_code)


if __name__ == "__main__":
    main()

# ----------------------------------------------------------------------------
# Segmentation note (for the Python/Pandas preprocessing step):
#
# Because this gateway records continuously, EmgSample.receivedAt spans every
# phase of every repetition without interruption (apart from real BLE gaps,
# see GatewayEvent). To label each sample with its phase:
#
#   1. Pull all EventLog rows for the session, ordered by `timestamp`.
#      Each row marks the START of a phase: PHASE_PREPARATION, PHASE_ACTION,
#      PHASE_REST (and REPETITION_START/END, SESSION_START/END as bracket
#      markers).
#   2. For each EmgSample, find the EventLog row with the largest
#      `timestamp` that is <= sample.receivedAt and whose eventType is one
#      of the PHASE_* types -> that is the active phase for that sample.
#      (A pandas merge_asof on receivedAt vs timestamp, direction="backward",
#      is the natural tool for this.)
#   3. Cross-reference GatewayEvent rows: any EmgSample.receivedAt falling
#      inside [disconnectedAt, reconnectedAt] for an open/closed gap should
#      be flagged/excluded, since the timeline was paused and downstream
#      samples after a gap may have a discontinuity even though timestamps
#      look continuous.
# ----------------------------------------------------------------------------
