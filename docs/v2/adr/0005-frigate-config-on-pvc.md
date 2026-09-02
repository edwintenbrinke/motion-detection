# 0005 — Frigate's config lives on a writable PVC, not a ConfigMap

**Status:** proposed · **Date:** 2026-09-02

## Context

Everything in the cluster is GitOps: Flux reconciles from git, drift is corrected, nothing is
changed by hand. The natural way to configure Frigate is therefore a ConfigMap.

Frigate does not agree. It **writes its own `config.yml`** — when you edit zones in the UI,
when the API sets a value, and increasingly so in 0.18, which moves configuration management
into the UI wholesale. A ConfigMap is read-only, so those writes fail.

And zone editing from the app is a requirement, not a nice-to-have. That is the whole "ik wil
een region kunnen selecteren" feature.

## Decision

`config.yml` lives on the Frigate config PVC and is writable. Git holds a **seed** copy plus a
nightly export, as documentation and as a restore path — not as the enforced source of truth.

## Consequences

**Good.** Zone editing from the app works, which is the point. Frigate's own UI stays usable
for tuning masks, which is where you want to be while tuning them. No fighting a tool over
who owns its state.

**Bad.** A genuine GitOps hole: reconstructing the cluster from git alone reproduces the seed
config, not the current one. Drift between git and reality is now normal rather than an
alarm.

**Mitigation.** A nightly CronJob exports `config.yml` to git (or MinIO) with a timestamped
commit. Restoring means copying the export onto the PVC. Document this in the runbook so the
next person does not assume the ConfigMap pattern applies here.

## Rejected alternatives

**ConfigMap, UI editing disabled.** Pure GitOps, and zones become a git commit and a Flux
reconcile — 30 seconds, from a laptop, not a phone. Rejected: it kills the app's zone editor.

**ConfigMap seeded into an emptyDir by an initContainer.** Writable, and reverts on every
restart. That is worse than either option: it looks like it works until a pod restarts and
silently discards your zones.

**Reconsider if:** Frigate ever gains a proper read-only-config mode with an external zone
store. Then this flips back.
