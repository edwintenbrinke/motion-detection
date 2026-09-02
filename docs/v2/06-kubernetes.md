# Running it on the cluster

Target: the `motion` namespace on `edwin-gpu`, managed by Flux from
[`homelab-cluster`](../../../homelab-cluster/README.md), in the same shape as the existing
`media` and `space-crucible-*` apps. The Pi stays outside the cluster — it is hardware with a
camera bolted to it, not a workload.

## Layout

```
kubernetes/apps/motion/
├── namespace.yaml
├── kustomization.yaml
├── storage/
│   ├── ks.yaml
│   └── app/{kustomization.yaml, pvc.yaml, nfs.yaml}
├── frigate/
│   ├── ks.yaml
│   └── app/{kustomization.yaml, ocirepository.yaml, helmrelease.yaml,
│             config.sops.yaml, httproute.yaml}
├── mosquitto/
│   ├── ks.yaml
│   └── app/{kustomization.yaml, helmrelease.yaml, configmap.yaml}
├── event-bridge/
│   ├── ks.yaml
│   └── app/{kustomization.yaml, helmrelease.yaml, secret.sops.yaml}
├── motion-api/
│   ├── ks.yaml
│   └── app/{kustomization.yaml, helmrelease.yaml, secret.sops.yaml, httproute.yaml}
└── motion-web/
    ├── ks.yaml
    └── app/{kustomization.yaml, helmrelease.yaml, httproute.yaml}
```

Same conventions as `kubernetes/apps/media/`: `app-template` 4.x via an `OCIRepository`,
one Flux `Kustomization` per app with `dependsOn`, SOPS for secrets, `namespace.yaml`
annotated `kustomize.toolkit.fluxcd.io/prune: disabled`.

Dependency order: `motion-storage` → `frigate` → `mosquitto` → `event-bridge` →
`motion-api` → `motion-web`.

## Prerequisite: the GPU. Read this before scheduling anything

The 1080 Ti is **not** usable by pods today. Making it usable requires, per
[`docs/hosts/edwin-gpu.md`](../../../homelab-cluster/docs/hosts/edwin-gpu.md):

1. A new Talos schematic including `siderolabs/nonfree-kmod-nvidia-production` and
   `siderolabs/nvidia-container-toolkit-production`
2. `machine.install.image` and `machine.kernel.modules` updated
3. **Re-provisioning the node**
4. The NVIDIA device plugin deployed so pods can request `nvidia.com/gpu`

Step 3 is the sharp edge: `edwin-gpu` is a **single-node cluster that also runs the Space
Crucible production game**. Re-provisioning takes production down. This needs a maintenance
window, a tested restore of the CNPG database, and an announcement — treat it as its own
change, not as a step inside the camera project.

Which is why [09-roadmap.md](09-roadmap.md) puts Frigate on the cluster **before** the GPU:
Phase 2 runs on CPU with the OpenVINO detector on the i5-8600K, which is entirely adequate
for one camera at 5 detect-fps. The GPU is an upgrade (better models, NVDEC, GenAI), not a
prerequisite. Ship the camera, then schedule the node work.

## Storage

Two kinds of data with opposite requirements. Getting this wrong is the classic Frigate
mistake.

| Data | Size | Where | Why |
|---|---|---|---|
| `/config` — config.yml, **SQLite db**, model cache | ~5–10 GB | PVC `openebs-hostpath` (NVMe) | **SQLite must not live on NFS.** Locking over NFS corrupts databases |
| `/media/frigate/recordings` | 100+ GB | NFS from `edwin-server` | Too big for a 500 GB NVMe that already holds Talos, images and CNPG |
| `/media/frigate/clips` — snapshots, previews | ~5 GB | NFS, same share | Small, but grows with retention |
| `/tmp/cache` | 1–2 GB | `emptyDir` with `medium: Memory` | Segment assembly. Never a PVC |
| `/dev/shm` | 256 Mi+ | `emptyDir` memory | ffmpeg needs it; the default 64 Mi is too small |

### Retention budget

At 1080p25 / 3 Mbit, one camera:

| Setting | Days | Disk |
|---|---|---|
| Continuous recording (`record.retain`) | 3 | ~96 GB |
| Alert recordings (`record.alerts.retain`) | 30 | ~7 GB |
| Detection recordings (`record.detections.retain`) | 7 | ~5 GB |
| Snapshots + previews | 30 | ~5 GB |
| **Total** | | **~115 GB** |

Three days of continuous is the sweet spot: long enough that "wait, what was that noise on
Tuesday" is answerable, short enough to fit. Drop to 1 day if space is tight; it is one
number.

> **Phase 0 check:** `docs/docker-to-k8s.md` in the homelab repo records `/mnt/external`
> and `/mnt/external3` at **98 % full**. Verify free space before committing to a number,
> and prefer `/mnt/external4` (10 TB) or a dedicated share. A Frigate that cannot write
> fails in ways that look like camera problems.

```yaml
# storage/app/nfs.yaml — same pattern as kubernetes/apps/media/storage/app/nfs.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: motion-recordings
spec:
  capacity: { storage: 200Gi }
  accessModes: ["ReadWriteOnce"]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  mountOptions: ["nfsvers=4.2", "hard", "noatime"]
  nfs:
    server: 192.168.1.253
    path: /mnt/external4/motion
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: frigate-config          # deliberately a standalone PVC, not Helm-managed,
spec:                           # so it survives a deleted HelmRelease
  accessModes: ["ReadWriteOnce"]
  storageClassName: openebs-hostpath
  resources: { requests: { storage: 20Gi } }
```

## Frigate

```yaml
# frigate/app/helmrelease.yaml (abbreviated — the shape, not the whole file)
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: &app frigate
spec:
  chartRef: { kind: OCIRepository, name: app-template }
  interval: 1h
  values:
    controllers:
      frigate:
        annotations: { reloader.stakater.com/auto: "true" }
        # SQLite + a writable config file: never two pods on the same volume.
        strategy: Recreate
        containers:
          app:
            image:
              repository: ghcr.io/blakeblackshear/frigate
              tag: 0.17.0-tensorrt        # pin. always pin
            env:
              TZ: Europe/Amsterdam
              # Pascal: FP16 runs at 1/64 rate. This must be false.
              USE_FP16: "false"
              YOLO_MODELS: yolov9-t-320
              NVIDIA_VISIBLE_DEVICES: all
              NVIDIA_DRIVER_CAPABILITIES: compute,utility,video
              FRIGATE_MQTT_PASSWORD: { valueFrom: { secretKeyRef: { name: frigate-secret, key: mqtt-password } } }
            probes:
              liveness: &probe
                enabled: true
                custom: true
                spec:
                  httpGet: { path: /api/version, port: 5000 }
                  initialDelaySeconds: 60
                  periodSeconds: 30
                  failureThreshold: 6
              readiness: *probe
            securityContext:
              privileged: false
              allowPrivilegeEscalation: false
            resources:
              requests: { cpu: 500m, memory: 1Gi }
              limits:
                memory: 4Gi
                nvidia.com/gpu: 1          # only after the device plugin exists
    defaultPodOptions:
      terminationGracePeriodSeconds: 30
    persistence:
      config:   { existingClaim: frigate-config, globalMounts: [{ path: /config }] }
      media:    { existingClaim: motion-recordings, globalMounts: [{ path: /media/frigate }] }
      cache:    { type: emptyDir, medium: Memory, sizeLimit: 2Gi, globalMounts: [{ path: /tmp/cache }] }
      dshm:     { type: emptyDir, medium: Memory, sizeLimit: 512Mi, globalMounts: [{ path: /dev/shm }] }
    service:
      app:
        controller: *app
        ports:
          http:   { port: 5000 }
          go2rtc: { port: 1984 }
          webrtc: { port: 8555, protocol: TCP }
```

`nvidia.com/gpu: 1` is a hard scheduling requirement — leave it out entirely until the
device plugin is running, or the pod sits `Pending` forever with a message nobody reads.

### WebRTC needs a real port, and only exists on the LAN

WebRTC will not traverse the Cloudflare Tunnel's HTTP-only path
([adr/0004](adr/0004-tailscale-for-remote.md)). Expose go2rtc's port 8555 (TCP **and** UDP)
as its own `LoadBalancer` Service, given a dedicated LAN IP by Cilium — the same pattern
Plex uses for its own `type: LoadBalancer` service, not an `envoy-internal` HTTPRoute (this
cluster never got split-DNS working; see the homelab roadmap's phase B). The app connects
to that LAN IP directly for WebRTC and falls back to MSE through the tunnel when it is not
reachable — i.e. whenever the phone is not on the LAN. Remote clients use the MSE port
(1984, plain HTTP) through the tunnel instead — that path rides the same HTTPRoute as the
rest of the API, below.

## Mosquitto

Minimal: one replica, a 1 Gi PVC for persistence, authentication on, no anonymous access, no
LoadBalancer. It exists so Frigate and the bridge can talk; nothing else should connect.

## event-bridge

A small image built from this repo (`python/bridge/`). Subscribes `frigate/reviews` and
`frigate/events`, POSTs to `motion-api` with a shared secret header, buffers to an
`emptyDir` when the API is unavailable and replays on reconnect.

Lock it down with a NetworkPolicy: it talks to mosquitto and motion-api, nothing else.

## motion-api and motion-web

The existing `api/` and `web/` images, built by CI in this repo and pinned by digest, same
as Space Crucible ([ADR 0005](../../../homelab-cluster/docs/adr/0005-tag-and-version-conventie.md)).

- MySQL: either a CNPG-style managed instance or keep MySQL 8.4 as a StatefulSet. The API
  currently targets MySQL; migrating it to Postgres to reuse CNPG is a real option but it is
  a separate project — do not bundle it into this one.
- `motion-web` is a static build behind nginx. It exists mainly so a browser can use the app;
  the phone runs the Capacitor bundle.

## Networking

One HTTPRoute, on `envoy-external`, for `motion.edwintenbrinke.nl` — the same pattern as
`plex.` and `files.`. This cluster never got split-DNS working (accepted as "trombone" in
the homelab roadmap's phase B), so a LAN client reaches this hostname the same way a remote
one does: through Cloudflare and back. There is no `envoy-internal` route for this app.

| Consumer | Path |
|---|---|
| Any client, HTTP (API, MSE/HLS live, clip playback) | Cloudflare Tunnel → `envoy-external` → `motion-api` / `motion-web` / `frigate` |
| LAN client, WebRTC only | Directly to the go2rtc `LoadBalancer` Service's LAN IP — no gateway, no tunnel |
| Pi → cluster | Nothing. The cluster dials **out** to the Pi's RTSP |

WebRTC is the one exception to "everything is one hostname": it cannot ride an HTTPRoute at
all (no Gateway API support for arbitrary UDP), so it gets its own `LoadBalancer` Service and
a LAN IP, exactly like Plex's `type: LoadBalancer` service today. The app tries that IP first
and falls back to the MSE path over the regular hostname when it's unreachable — which is
also what "off the LAN" looks like from the app's point of view. Reasoning for reusing the
tunnel rather than a VPN: [adr/0004-tailscale-for-remote.md](adr/0004-tailscale-for-remote.md).

## Resource sizing

One node runs all of this plus the production game and the Prometheus stack. Budget:

| Workload | CPU request | CPU limit | Memory limit | GPU |
|---|---|---|---|---|
| frigate (CPU detector, phase 2) | 1000m | 2500m | 4 Gi | — |
| frigate (GPU detector, phase 3+) | 500m | 1500m | 4 Gi | 1 |
| mosquitto | 10m | 100m | 128 Mi | — |
| event-bridge | 10m | 100m | 128 Mi | — |
| motion-api (fpm + worker) | 200m | 1000m | 1 Gi | — |
| motion-web | 10m | 100m | 128 Mi | — |
| ollama (optional) | 200m | 2000m | 8 Gi | shares |

The i5-8600K has 6 cores. Frigate on CPU detection is the one workload that can genuinely
starve the game, so its **limit** matters more than its request. Set it, and watch it for a
week before relaxing it.

Ollama and Frigate sharing one 11 GB card works but is not free: see
[03-detection-and-ai.md](03-detection-and-ai.md#layer-4--a-local-vision-llm-the-fun-one-the-slow-one).
If GenAI becomes flaky, move it to a nightly batch rather than fighting the contention.

## Observability

The Prometheus stack is already there. Add:

- A `ServiceMonitor` for Frigate's metrics endpoint
- A Grafana dashboard: detector inference time, camera fps vs expected, skipped frames,
  process CPU, GPU utilisation and VRAM, disk used vs retention budget
- Alerts that actually matter: **camera offline > 2 min**, detection fps below target,
  recordings volume above 90 %, and no events at all for 12 h (a silent camera looks
  identical to a working one on a quiet day — this alert is the one that catches a dead Pi)

## Backups

| What | How |
|---|---|
| Frigate `config.yml` | CronJob exports it to git / MinIO nightly — see [adr/0005](adr/0005-frigate-config-on-pvc.md) |
| Frigate SQLite | Nightly `.backup` to MinIO. Losing it loses event metadata, not video |
| MySQL | Existing backup path to MinIO on `edwin-server` |
| Recordings | **Not backed up.** They are transient by design; retention deletes them anyway |
| Trained classifier models | Back these up. Retraining costs an afternoon of labelling |
