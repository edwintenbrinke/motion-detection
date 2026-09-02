# Detection, zones and AI tagging

Two separate things live in this document: **deciding something happened** (motion + zones,
cheap, must be instant) and **deciding what it was** (object detection + classification +
description, expensive, allowed to be slow). Keeping them separate is what makes the system
both responsive and smart.

## The pipeline

```
frame ─► motion mask ─► is anything moving outside the masked areas?
                            │ no  → drop. 95% of frames end here, cost ≈ nothing
                            │ yes
                            ▼
                    object detection (GPU)  ── only on the moving regions
                            │
                            ▼
                    tracking: box → object with an id, a lifetime, a best snapshot
                            │
                            ▼
                    zones: is the object inside the polygon you drew?
                            │
                            ▼
                    review item:  alert  (person/car in a zone)  → notify
                                  detection (everything else)    → log, no buzz
                            │
                            ▼
                    enrichment (async, seconds later, never blocks the notification):
                      sub-label classifier · face · plate · GenAI description · embeddings
```

The order matters. Object detection never runs on a still frame, so a camera watching a
quiet street costs a few percent of a core all night. And the notification fires at the
review-item step — enrichment arriving ten seconds later updates the event, it does not
delay the buzz.

## Motion, and why the current threshold model goes away

Today: `absdiff` → `threshold(25)` → `countNonZero > motion_threshold`. One global number,
tuned by hand, that cannot distinguish a cyclist from headlights sweeping the wall or a
branch in the wind. Every false positive costs a recording and, in v2, would cost a
notification.

Frigate's motion stage is the same idea done properly: contour-based, with an adaptive
background frame, `threshold` and `contour_area` as the two knobs, and **motion masks** for
the parts of the frame that always move and never matter — the road, a tree, a neighbour's
window, and any on-screen timestamp overlay.

```yaml
motion:
  threshold: 30           # pixel delta; lower = more sensitive
  contour_area: 10        # ignore blobs smaller than this
  improve_contrast: true  # helps a lot at night on a NoIR sensor
  mask:
    - 0,0,1,0,1,0.25,0,0.25       # the strip of sky/street at the top
```

Mask first, then tune. Almost every "too many false alerts" problem is a missing mask, not a
wrong threshold.

## Zones — where the ROI you draw ends up

Your `detection_area_points` (`[{x: 0.0–1.0, y: 0.0–1.0}, …]`) map onto a Frigate **zone**
one-to-one: Frigate takes normalised coordinates as comma-separated `x,y` pairs. The existing
`ImageRegionSelector.vue` keeps working; only the serialisation changes.

```yaml
cameras:
  voordeur:
    zones:
      pad:
        coordinates: 0.31,0.85,0.28,0.52,0.62,0.49,0.72,0.83
        loitering_time: 0
        objects: [person, package]
      straat:
        coordinates: 0,0.42,1,0.42,1,0.62,0,0.62
        objects: [car, bicycle, motorcycle]
```

Two things zones give you that a single ROI mask cannot:

- **Different rules per region.** The path to the door notifies; the street in the
  background is recorded and labelled but never buzzes. Today's one polygon plus one
  "important" flag cannot express that.
- **Per-zone object filters.** A `person` in `pad` matters. A `person` on the pavement is
  someone walking their dog.

Zones are also the right place for the "is this a delivery" question: a `person` that enters
`pad`, stops (`loitering_time`), and leaves within two minutes is a very different event from
one that walks past.

> **Coordinate ordering.** Frigate expects the polygon's points in order around the shape;
> the app's editor must not reorder them (the current `_hash_points` sorts points to detect
> changes — that is fine for hashing, but the stored order must be preserved).

## Object detection on the 1080 Ti

### What the card actually is

| Property | GTX 1080 Ti (GP102, Pascal) | Consequence |
|---|---|---|
| VRAM | 11 GB | Room for a detector *and* a 7B vision model |
| FP16 | **1/64 rate — effectively broken** | Never enable FP16. `USE_FP16=false` |
| INT8 (DP4A) | ~44 TOPS, fast | Quantised models are the sweet spot |
| FP32 | 11.3 TFLOPS | Perfectly good for YOLO at 320/640 |
| NVDEC | H.264 hardware decode | Frigate decodes the RTSP stream for ~free |
| CUDA status | Supported in 12.x, but Pascal is end-of-life-ward | Pin your images; expect to migrate eventually |

### Configuration

Frigate 0.16 removed the standalone TensorRT detector; on NVIDIA you now use the **ONNX
detector** with the `-tensorrt` image, and TensorRT acceleration is applied automatically.
The ONNX detector no longer ships prebuilt models, so you supply one — `YOLO_MODELS` will
generate the engine on first start.

```yaml
detectors:
  ort:
    type: onnx

model:
  model_type: yolo-generic
  width: 320
  height: 320
  input_tensor: nchw
  input_dtype: float
  path: /config/model_cache/yolov9-t-320.onnx
  labelmap_path: /labelmap/coco-80.txt

ffmpeg:
  hwaccel_args: preset-nvidia     # NVDEC — do this, it halves CPU

cameras:
  voordeur:
    detect:
      width: 1280
      height: 720
      fps: 5
```

```yaml
# HelmRelease env
USE_FP16: "false"          # Pascal. Non-negotiable
YOLO_MODELS: "yolov9-t-320"
NVIDIA_VISIBLE_DEVICES: "all"
NVIDIA_DRIVER_CAPABILITIES: "compute,utility,video"
```

Expected inference on this card, one camera:

| Model | Input | Inference | Headroom |
|---|---|---|---|
| YOLOv9-t | 320×320 | ~5–10 ms | dozens of cameras |
| YOLOv9-s | 640×640 | ~15–25 ms | ~10 cameras |
| RF-DETR | 336 | ~20–30 ms | plenty; better on small objects |

Start with **YOLOv9-t at 320**. If small or distant objects are being missed, go to 640
before you go to a bigger model — input resolution buys more than parameters here. And
`detect.fps: 5` is enough: detection runs on the downscaled detect stream, tracking fills in
between, and the recording is still 25 fps.

### Detection is not free CPU-wise either

Even with NVDEC, Frigate uses ~0.5–1.5 cores per 1080p camera for the detect pipeline and
recording remux. On a node that also runs the Space Crucible production game, set limits
(see [06-kubernetes.md](06-kubernetes.md#resource-sizing)).

## The tagging ladder

You asked for tags that say whether it was a car, a passing cyclist, or a delivery driver.
That is not one model — it is four layers, in increasing order of cost and decreasing order
of reliability. Build them in this order and stop wherever it is good enough.

### Layer 1 — COCO labels (free, instant, reliable)

The base detector already gives you these, and they cover most of the question:

`person` · `car` · `bicycle` · `motorcycle` · `bus` · `truck` · `dog` · `cat` · `bird`

"Is het gewoon een auto of een fietser?" is answered here, at ~10 ms, with no extra work.
Ship this first and see how much of the problem it solves — in practice it is most of it.

```yaml
objects:
  track: [person, car, bicycle, motorcycle, dog, cat]
  filters:
    person: { min_score: 0.6, threshold: 0.75 }
    car:    { min_score: 0.5, threshold: 0.7, mask: 0,0,1,0,1,0.3,0,0.3 }
```

### Layer 2 — zone + time logic (free, deterministic)

Rules over layer 1, evaluated in the BFF. No model, no GPU, completely predictable:

| Pattern | Tag |
|---|---|
| `car` crosses `straat` only, < 5 s | `voorbijganger` |
| `person` in `pad`, dwell > 8 s, leaves < 120 s | `bezoek` |
| `person` in `pad` between 08:00–18:00, dwell 10–90 s, no `bicycle` | `mogelijk bezorger` |
| `bicycle` + `person`, `straat` only | `fietser` |
| `person` in `pad` after 23:00 | `nacht` (higher priority notification) |

This layer is worth more than it looks. Deterministic rules never hallucinate, they are
trivially explainable in the UI ("bezoek — 14 s bij de deur"), and they cost nothing.

### Layer 3 — custom classification (a weekend, very effective)

Frigate 0.17 can train a **MobileNetV2 classifier on your own snapshots**, from its own UI,
and attach the result as a sub-label or attribute. Two flavours, both directly useful here:

- **Object classification** on `person`: classes `bezorger`, `postbode`, `bewoner`,
  `onbekend`. This is the real answer to "is dit een pakketbezorger" — a courier in your
  driveway looks distinctive (uniform, hand truck, van behind them, a box) and a small
  classifier trained on *your* door in *your* light learns it far better than any general
  model.
- **State classification** on a fixed region — the doormat: `pakket aanwezig` /
  `leeg`. This is the most reliable package detector there is, because it answers the
  question you actually care about ("is er iets bezorgd?") rather than the harder one
  ("draagt deze persoon een doos?").

Training needs diverse examples, not many: a few dozen genuinely different images beat
hundreds of near-identical frames. Which is why the app should have a **"dit klopt niet"**
button on every event — it is a labelling pipeline disguised as a feedback feature. See
[05-android-app.md](05-android-app.md).

### Layer 4 — a local vision LLM (the fun one, the slow one)

Frigate can call an LLM to write a title and description for each review item and classify
it as normal / suspicious / dangerous. Point it at **Ollama on the same 1080 Ti** with a
vision model:

```yaml
genai:
  enabled: true
  provider: ollama
  base_url: http://ollama.motion.svc.cluster.local:11434
  model: qwen2.5vl:7b
  prompt: >
    Beschrijf in één zin wat er gebeurt. Noem het type persoon of voertuig,
    of iemand iets draagt of aflevert, en de richting van beweging.
```

What this buys you: descriptions in plain language ("een bezorger in een blauw uniform zet
een pakket bij de deur"), and — because Frigate embeds those descriptions — **semantic
search**: typing "man met pakket" in the app finds the clip. That is a genuinely better
review experience than scrolling a calendar.

The costs, honestly:

| | |
|---|---|
| Latency | 5–20 s per event on this card. Fine — it is async, the notification already fired |
| VRAM | Qwen2.5-VL 7B at Q4 ≈ 6–7 GB, plus ~1–2 GB for the detector. Fits in 11 GB, but only just |
| Contention | Ollama loading a model can stall the detector. Set `keep_alive: -1` so it stays resident, and only run GenAI on **alerts**, never on every detection |
| Reliability | It is a 7B model describing a dark 720p crop. Treat descriptions as colour, not as truth. Never drive a notification *decision* from it |

If VRAM gets tight, run GenAI on a schedule (batch the day's alerts at night) rather than
inline. The card does not need to be fast, it needs to be free of the detector when it runs.

### Optional extras Frigate gives you for nothing

- **Face recognition** — "dat is Edwin" suppresses the notification. Local, no subscription.
- **Licence plate recognition** — recognise your own car so it never alerts.
- **Triggers** — fire an action when an object semantically matches a reference image or
  phrase.

Each one is a settings toggle plus training data, not an engineering project.

## Where tags are stored

Frigate keeps them; the BFF mirrors them so the app can filter without touching SQLite:

| Field | Source |
|---|---|
| `label` | detector (layer 1) |
| `sub_label` | classifier / face / plate (layer 3) |
| `zones[]` | Frigate zones |
| `derived_tags[]` | BFF rules (layer 2) |
| `description`, `title`, `severity` | GenAI (layer 4) |
| `score`, `top_score` | detector |

See [07-api-and-data-model.md](07-api-and-data-model.md#event-mirror).

## A note on the NoIR camera

`imx708_wide_noir` has no IR-cut filter. Two consequences worth planning for:

- **Daytime colour is off** — reds and purples bloom. libcamera applies a NoIR tuning file
  which helps, but do not be surprised by the cast, and do not let a classifier train only on
  daylight images that all share it.
- **Night needs an IR illuminator.** A NoIR sensor in the dark with no IR light is just a
  dark sensor. Add an IR LED; detection accuracy at night depends far more on that £15 lamp
  than on the model you pick.
