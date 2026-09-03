"""Offline tests: no MQTT broker, no HTTP server. Run with:

    pip install -r requirements.txt
    python3 -m unittest test_bridge -v
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import requests

from main import Bridge, Config, parse_review

FIXTURES = Path(__file__).parent / "fixtures"


class ParseReviewTests(unittest.TestCase):
    def test_alert_person(self):
        raw = (FIXTURES / "review-alert-person.json").read_bytes()
        event = parse_review(raw)
        self.assertEqual(event["camera"], "voordeur")
        self.assertEqual(event["severity"], "alert")
        self.assertEqual(event["labels"], ["person"])
        self.assertEqual(event["zones"], ["pad"])
        self.assertIn("raw", event)  # forward-compatibility: always keep the original

    def test_detection_car(self):
        raw = (FIXTURES / "review-detection-car.json").read_bytes()
        event = parse_review(raw)
        self.assertEqual(event["severity"], "detection")
        self.assertEqual(event["zones"], ["straat"])

    def test_garbage_input_does_not_raise(self):
        self.assertIsNone(parse_review(b"not json"))

    def test_missing_data_block_does_not_raise(self):
        event = parse_review(json.dumps({"after": {"id": "x", "camera": "voordeur"}}).encode())
        self.assertEqual(event["labels"], [])
        self.assertEqual(event["zones"], [])


class BridgeBufferingTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)

        class TestConfig(Config):
            BUFFER_PATH = Path(self.tmpdir.name) / "pending.jsonl"
            BRIDGE_SECRET = "test-secret"

        self.config = TestConfig
        self.bridge = Bridge(self.config)

    def test_failed_delivery_is_buffered_and_replayed(self):
        event = {"id": "evt-1", "camera": "voordeur"}

        with patch.object(self.bridge.session, "post") as post:
            post.side_effect = requests.exceptions.ConnectionError("api is down")
            self.bridge.handle(event)

        self.assertTrue(self.config.BUFFER_PATH.exists())
        self.assertEqual(len(self.config.BUFFER_PATH.read_text().splitlines()), 1)

        # API comes back — next handle() call flushes the buffer before delivering the new one
        ok_response = MagicMock(status_code=200)
        with patch.object(self.bridge.session, "post", return_value=ok_response) as post:
            self.bridge.handle({"id": "evt-2", "camera": "voordeur"})
            self.assertEqual(post.call_count, 2)  # evt-1 replayed, then evt-2

        self.assertEqual(self.config.BUFFER_PATH.read_text(), "")

    def test_ordering_preserved_when_second_retry_also_fails(self):
        fail_response = MagicMock(status_code=503, text="")
        with patch.object(self.bridge.session, "post", return_value=fail_response):
            self.bridge.handle({"id": "evt-1"})
            self.bridge.handle({"id": "evt-2"})

        lines = self.config.BUFFER_PATH.read_text().splitlines()
        self.assertEqual([json.loads(l)["id"] for l in lines], ["evt-1", "evt-2"])

    def test_truncated_buffer_line_does_not_jam_the_whole_buffer(self):
        # Simulates the process being killed mid-write: a half-written line followed by
        # a good one. The good one must still get through.
        self.config.BUFFER_PATH.write_text('{"id": "evt-trunc", "cam\n{"id": "evt-good"}\n')

        ok_response = MagicMock(status_code=200)
        with patch.object(self.bridge.session, "post", return_value=ok_response) as post:
            self.bridge.flush_buffer()

        delivered = [call.kwargs["json"]["id"] for call in post.call_args_list]
        self.assertEqual(delivered, ["evt-good"])
        self.assertEqual(self.config.BUFFER_PATH.read_text(), "")

    def test_client_error_is_dropped_not_retried(self):
        bad_response = MagicMock(status_code=422, text="unprocessable")
        with patch.object(self.bridge.session, "post", return_value=bad_response):
            self.bridge.handle({"id": "evt-1"})

        # Delivered (in the sense of "handled") on the first try — a 4xx is not retried,
        # so nothing should ever have been written to the buffer file at all.
        self.assertFalse(self.config.BUFFER_PATH.exists())


if __name__ == "__main__":
    unittest.main()
