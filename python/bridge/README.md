# event-bridge

Frigate's MQTT `frigate/reviews` topic → `POST {API_BASE_URL}/api/internal/events` on
motion-api. Runs as a pod in the cluster (`motion` namespace), not on the Pi.

Full reasoning: [../../docs/v2/04-notifications.md](../../docs/v2/04-notifications.md#the-path)
and [../../docs/v2/06-kubernetes.md](../../docs/v2/06-kubernetes.md#event-bridge).

## Why it exists instead of Symfony subscribing directly

Symfony has no good way to hold a long-lived MQTT connection, and Doctrine Messenger has no
MQTT transport worth adding for one small job. This is ~200 lines with one dependency
(`paho-mqtt`) that does exactly one thing and is easy to reason about when it breaks.

## Behaviour

- Subscribes to `frigate/reviews` only — not `frigate/events`, which is per-object and far
  chattier. A review item is Frigate's own "this was an incident" grouping.
- Every message is POSTed to motion-api with a shared-secret header (`X-Bridge-Secret`).
- If the API is unreachable, events are buffered to a JSONL file and replayed **in order**
  as soon as delivery succeeds again — see `flush_buffer()` in `main.py`. This is why the
  container needs a small persistent volume (an `emptyDir` is fine; losing the buffer on a
  pod restart loses at most a few minutes of events, not silently forever).
- A 4xx from the API is treated as permanent and dropped with a loud log line, not retried
  forever — only 5xx and network errors go to the buffer.

## Configuration

| Env var | Default | |
|---|---|---|
| `MQTT_HOST` | `mosquitto` | |
| `MQTT_PORT` | `1883` | |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | — | |
| `API_BASE_URL` | `http://motion-api` | |
| `BRIDGE_SECRET` | — | **required** — the process refuses to start without it |
| `BUFFER_PATH` | `/var/lib/event-bridge/pending.jsonl` | |

## Testing without a cluster

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest test_bridge -v
```

`test_bridge.py` covers the parsing (including malformed input) and the buffer/replay/drop
logic with mocked HTTP — no MQTT broker or live API needed.

Once Frigate and Mosquitto exist, drive it end-to-end with the fixtures in `fixtures/`:

```bash
mosquitto_pub -h <mosquitto-host> -t frigate/reviews -f fixtures/review-alert-person.json
mosquitto_pub -h <mosquitto-host> -t frigate/reviews -f fixtures/review-alert-delivery.json
mosquitto_pub -h <mosquitto-host> -t frigate/reviews -f fixtures/review-detection-car.json
```

`fixtures/generate_storm.py` produces a burst of alerts for exercising the notification
rate-cap described in
[../../docs/v2/04-notifications.md](../../docs/v2/04-notifications.md#failure-modes-to-design-for-now):

```bash
python3 fixtures/generate_storm.py 50 > /tmp/storm.jsonl
while read -r line; do mosquitto_pub -h <host> -t frigate/reviews -m "$line"; sleep 1; done < /tmp/storm.jsonl
```

## One known gap

`parse_review()` is written against Frigate's documented 0.14+ review-item shape, but the
exact JSON has shifted between Frigate versions. **Before wiring this into the real
cluster**, subscribe to the actual `frigate/reviews` topic once Frigate 0.17.0 is running
(`mosquitto_sub -t frigate/reviews`) and confirm the field paths in `parse_review()` still
match — adjust there, not here.
