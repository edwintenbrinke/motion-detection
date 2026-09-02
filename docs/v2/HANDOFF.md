# Handoff — what's blocked on you

Running list. Anything here I skip and log, rather than guess or work around. Everything
*not* on this list, I execute and commit myself while you're away.

**Status key:** ⬜ not started · 🔶 prepared, waiting on you · ✅ done

## Needs your credentials or accounts

| # | What | Why I can't do it | What you do when you're back |
|---|---|---|---|
| 1 | ⬜ Firebase project for FCM | Needs your Google account, browser, 2FA | Create a Firebase project → Cloud Messaging → download `google-services.json` → drop it at `web/android/app/google-services.json` (not in git — see `.gitignore`) |
| 2 | ⬜ `MEDIA_SIGNING_KEY` secret | Fine for me to generate, but it needs to go into SOPS which needs your `age.key` | I'll generate the value and leave it in `docs/v2/HANDOFF.md` § secrets below, or a local file — you run `sops -e` |
| 3 | ⬜ Frigate/Mosquitto SOPS secrets | Same — needs `age.key` from `homelab-cluster/age.key` | Same as above |
| 4 | ⬜ NFS export on edwin-server | Needs sudo on `edwin-server` (192.168.1.253), a box I have no access to | Run the `/etc/exports` change in `docs/v2/06-kubernetes.md` yourself, or tell me if I should have SSH access to it too |

## Needs a deliberate, awake decision from you (not a credentials problem)

These are things I will **prepare but not execute**, because they're hard to reverse or
outward-facing and "let it run overnight" isn't the same as "go ahead and do this specific
irreversible thing":

| # | What | Why it waits for you |
|---|---|---|
| 5 | 🔶 Start MediaMTX on the Pi | `python/deploy/install.sh` is ready — installs and enables the service but does not start it. Nothing is currently running on the Pi (confirmed by you), so there's no conflicting process to stop this time; still flagging it since it's the first thing that actually runs on real hardware. Run it with `ssh rpi` + `./install.sh`, or tell me to go ahead |
| 6 | ⬜ Pushing `kubernetes/apps/motion/*` to `homelab-cluster` main | Flux auto-applies on push. I'll build it on a branch and open it for your review first — not merge it myself |
| 7 | ⬜ GPU node re-provisioning (Phase 3) | Takes down `space-crucible-prod`. Explicitly scheduled as its own maintenance window in the roadmap, not attempted here regardless of time available |
| 8 | ⬜ Creating the `motion.edwintenbrinke.nl` DNS/HTTPRoute | Cheap and safe, but it's the first real "this is now reachable" step — flagging it rather than silently making something newly reachable while you're asleep |

## What I'm doing instead, tonight

Everything that's pure repo work with no real-world side effect until someone applies it:

- ✅ Pi-side: MediaMTX config, systemd unit, install script, README (files only — not run
  on the actual Pi; that is item 5 above)
- ✅ Legacy Python agent moved to `python/legacy/`, Dockerfile/compose updated to match
- ✅ `event-bridge`: MQTT→HTTP service with buffering/replay, unit-tested (7/7 passing,
  no MQTT broker or live API needed — see `python/bridge/README.md`), fixtures for manual
  testing once Frigate exists
- ⬜ `homelab-cluster`: the `kubernetes/apps/motion/` manifests, on a branch, not pushed
- ⬜ API: `Event`/`Device`/`NotificationRule` entities + migrations, the new endpoints, the
  media-URL signer — as code, against a local/dev DB, not touching anything live
- ⬜ App: the API-client abstraction layer + events feed scaffolding, buildable but not shipped

I'll commit each piece as it's done so nothing is lost if the session ends mid-task, and
update this file's status column as I go.

## Secrets generated tonight (fill into SOPS yourself)

*(populated as I generate them — check back here)*
