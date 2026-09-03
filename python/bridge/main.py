"""event-bridge: Frigate's MQTT review/event stream → the motion-api HTTP endpoint.

Why this exists at all: Symfony has no business holding a long-lived MQTT subscription,
and Doctrine Messenger has no MQTT transport worth adding for one small job. This is a
deliberately small, dependency-light service that does exactly one thing — see
../../docs/v2/04-notifications.md and ../../docs/v2/06-kubernetes.md#event-bridge.

Behaviour:
  - Subscribes to `frigate/reviews` (the "something happened" stream — alerts vs
    detections). `frigate/events` is deliberately NOT forwarded: it is per-object and far
    chattier, and review items are what a human would call "an incident".
  - POSTs each message to `{API_BASE_URL}/api/internal/events` with a shared-secret header.
  - If the API is unreachable, buffers messages to a local JSONL file and replays them
    (oldest first) as soon as a POST succeeds again. This is why the container needs a
    small persistent volume — see the Dockerfile.

NOTE on the Frigate payload shape: this reads the fields documented for 0.14+ review
items (id, camera, severity via `data.type` or top-level `severity` depending on version,
`after.data.objects`, `after.data.zones`, `after.data.sub_labels`). Frigate's exact JSON
shape has moved between versions — verify against the pinned version (0.17.0, per
docs/v2/09-roadmap.md) once Frigate is actually running, using `mosquitto_sub -t
frigate/reviews` against the real instance, and adjust `parse_review()` below rather than
guessing further from documentation alone.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

import paho.mqtt.client as mqtt
import requests

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
)
log = logging.getLogger("event-bridge")


class Config:
    MQTT_HOST = os.environ.get("MQTT_HOST", "mosquitto")
    MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
    MQTT_USERNAME = os.environ.get("MQTT_USERNAME")
    MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD")
    MQTT_CLIENT_ID = os.environ.get("MQTT_CLIENT_ID", "event-bridge")
    REVIEW_TOPIC = os.environ.get("MQTT_REVIEW_TOPIC", "frigate/reviews")

    API_BASE_URL = os.environ.get("API_BASE_URL", "http://motion-api")
    INTERNAL_EVENTS_ENDPOINT = os.environ.get(
        "INTERNAL_EVENTS_ENDPOINT", "/api/internal/events"
    )
    BRIDGE_SECRET = os.environ.get("BRIDGE_SECRET", "")

    BUFFER_PATH = Path(os.environ.get("BUFFER_PATH", "/var/lib/event-bridge/pending.jsonl"))
    HTTP_TIMEOUT_SECONDS = float(os.environ.get("HTTP_TIMEOUT_SECONDS", "5"))
    RETRY_INTERVAL_SECONDS = float(os.environ.get("RETRY_INTERVAL_SECONDS", "10"))


def parse_review(raw: bytes) -> dict | None:
    """Turn a raw frigate/reviews payload into the shape motion-api expects.

    Defensive by design: an unexpected shape should not crash the bridge or lose the
    event. When in doubt, forward more rather than less — `raw` always rides along so the
    API (or a human, later) can recover fields this function guessed wrong.
    """
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("Non-JSON payload on review topic, dropping: %r", raw[:200])
        return None

    after = payload.get("after") or payload
    data = after.get("data", {}) or {}

    return {
        "source": "frigate",
        "type": payload.get("type"),  # "new" | "update" | "end"
        "id": after.get("id"),
        "camera": after.get("camera"),
        "severity": after.get("severity"),  # "alert" | "detection"
        "started_at": after.get("start_time"),
        "ended_at": after.get("end_time"),
        "labels": data.get("objects", []),
        "sub_labels": data.get("sub_labels", []),
        "zones": data.get("zones", []),
        "top_score": after.get("top_score") or data.get("top_score"),
        "has_clip": bool(after.get("has_clip")),
        "has_snapshot": bool(after.get("has_snapshot")),
        "raw": payload,
    }


class Bridge:
    def __init__(self, config: type[Config]):
        self.config = config
        self.config.BUFFER_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()

    # -- delivery -----------------------------------------------------------------

    def deliver(self, event: dict) -> bool:
        """POST one event to motion-api. Returns True on success."""
        try:
            resp = self.session.post(
                f"{self.config.API_BASE_URL}{self.config.INTERNAL_EVENTS_ENDPOINT}",
                json=event,
                headers={"X-Bridge-Secret": self.config.BRIDGE_SECRET},
                timeout=self.config.HTTP_TIMEOUT_SECONDS,
            )
            if resp.status_code >= 500:
                log.warning("API returned %s, will retry: %s", resp.status_code, resp.text[:200])
                return False
            if resp.status_code >= 400:
                # A 4xx is not a transient failure — retrying it won't help, and it would
                # jam the buffer forever. Log it loudly and drop it.
                log.error(
                    "API rejected event %s (%s), dropping: %s",
                    event.get("id"), resp.status_code, resp.text[:300],
                )
                return True
            return True
        except requests.RequestException as exc:
            log.warning("Could not reach API (%s), will retry", exc)
            return False

    def buffer(self, event: dict) -> None:
        with self.config.BUFFER_PATH.open("a") as fh:
            fh.write(json.dumps(event) + "\n")

    def flush_buffer(self) -> None:
        """Replay buffered events oldest-first. Stops at the first failure so ordering
        is preserved and nothing is skipped."""
        if not self.config.BUFFER_PATH.exists():
            return
        lines = self.config.BUFFER_PATH.read_text().splitlines()
        if not lines:
            return
        log.info("Replaying %d buffered event(s)", len(lines))
        for i, line in enumerate(lines):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                # A line can be truncated if the process was killed mid-write. Dropping
                # it loses one event; letting it raise would jam the whole buffer
                # permanently, losing every event behind it too.
                log.error("Dropping unparseable buffered line: %r", line[:200])
                continue
            if not self.deliver(event):
                # Keep this one and everything after it; write back and stop.
                remaining = lines[i:]
                self.config.BUFFER_PATH.write_text(
                    "\n".join(remaining) + ("\n" if remaining else "")
                )
                return
        self.config.BUFFER_PATH.write_text("")

    def handle(self, event: dict) -> None:
        self.flush_buffer()
        if self.deliver(event):
            return
        log.info("Buffering event %s for later delivery", event.get("id"))
        self.buffer(event)

    # -- MQTT -----------------------------------------------------------------------

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            log.error("MQTT connect failed: %s", reason_code)
            return
        log.info("Connected to MQTT, subscribing to %s", self.config.REVIEW_TOPIC)
        client.subscribe(self.config.REVIEW_TOPIC, qos=1)
        self.flush_buffer()

    def on_message(self, client, userdata, msg):
        event = parse_review(msg.payload)
        if event is None:
            return
        log.info(
            "Review %s: %s/%s in %s (%s)",
            event["type"], event["camera"], event["severity"], event["zones"], event["id"],
        )
        self.handle(event)

    def run(self) -> None:
        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self.config.MQTT_CLIENT_ID,
            clean_session=False,  # persistent session: don't miss events sent while we're down
        )
        if self.config.MQTT_USERNAME:
            client.username_pw_set(self.config.MQTT_USERNAME, self.config.MQTT_PASSWORD)
        client.on_connect = self.on_connect
        client.on_message = self.on_message

        while True:
            try:
                client.connect(self.config.MQTT_HOST, self.config.MQTT_PORT, keepalive=30)
                client.loop_forever(retry_first_connection=True)
            except Exception:
                log.exception("MQTT loop crashed, reconnecting in %ss", self.config.RETRY_INTERVAL_SECONDS)
                time.sleep(self.config.RETRY_INTERVAL_SECONDS)


def main() -> None:
    if not Config.BRIDGE_SECRET:
        log.error("BRIDGE_SECRET is not set — refusing to start with an unauthenticated bridge")
        sys.exit(1)
    Bridge(Config).run()


if __name__ == "__main__":
    main()
