#!/usr/bin/env python3
"""Generate a burst of review-item fixtures for testing the rate-cap / summary logic
described in ../../../docs/v2/04-notifications.md#failure-modes-to-design-for-now.

Usage:
    python3 generate_storm.py 50 > storm.jsonl
    while read -r line; do
        mosquitto_pub -h localhost -t frigate/reviews -m "$line"
        sleep 1
    done < storm.jsonl
"""
import json
import sys
import time

count = int(sys.argv[1]) if len(sys.argv) > 1 else 50
base_time = time.time()

for i in range(count):
    event = {
        "type": "end",
        "after": {
            "id": f"{base_time + i}.storm-{i:04d}",
            "camera": "voordeur",
            "severity": "alert",
            "start_time": base_time + i,
            "end_time": base_time + i + 3,
            "top_score": 0.7,
            "has_clip": True,
            "has_snapshot": True,
            "data": {"objects": ["person"], "sub_labels": [], "zones": ["pad"]},
        },
    }
    print(json.dumps(event))
