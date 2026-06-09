---
adr: "010"
title: "bench CLI excluded from frappe-ctl scope — Cloud API is the infra surface"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [architecture, bench, frappe-cloud, scope]
---

# ADR-010: `bench` CLI is out of scope — Frappe Cloud Management API is the correct infra surface

## Decision

`frappe-ctl` does not wrap, proxy, or shell out to `bench`. Infra operations (backup, migrate, restart) on Frappe Cloud are out of scope for now; if added in the future, they go through the **Frappe Cloud Management API** (Press API), not bench.

## Context

### Frappe Cloud access tiers — what bench access actually means

| Deployment | bench available? | Notes |
|---|---|---|
| Self-hosted (own server) | Yes — first-class ops tool | No Frappe Cloud API |
| Frappe Cloud Shared ($5+) | No — no SSH | REST + Cloud API only |
| Frappe Cloud Private Bench ($25+) | SSH, 6-hour certs — debug only | Cloud API is the ops surface |
| Frappe Cloud Dedicated Server | SSH — debug only | Cloud API is the ops surface |
| Enterprise / Hybrid | SSH — debug only | Cloud API is the ops surface |

Three facts break the "add bench support for higher plans" argument:

1. **Bench on Cloud = debugging, not operations.** Frappe's own docs scope SSH access to diagnostics (`bench doctor`, `bench restart`). Their managed update pipeline can overwrite arbitrary bench changes. `bench migrate`, `bench get-app`, `bench setup` are explicitly unsafe on managed infra.

2. **The correct Cloud ops surface is the Frappe Cloud Management API** (`frappecloud.com/docs/api`). Auth: `Token key:secret` + `X-Press-Team` header. Covers backup, restore, site operations — what you'd reach for bench to do. This API exists for all paid tiers and is the intended path.

3. **Credential models don't unify.** Self-hosted bench uses OS-level server access. Frappe Cloud REST uses API key. Cloud API uses a separate Press token. Adding bench would force frappe-ctl to handle SSH or assume co-location — incompatible with the zero-dependency, remote-HTTP design (ADR-003).

### What bench does that frappe-ctl never needs

- `bench init`, `bench new-site`, `bench install-app` — site/app provisioning
- `bench migrate` — schema patches (DB ops, not record ops)
- `bench start/restart`, `bench setup nginx|supervisor` — process/infra control
- `bench backup/restore` — full-site dumps

None of these are data operations. `frappe-ctl` is a data+workflow tool, not an infra tool.

### Residual overlap: `bench execute` and `bench mariadb`

These can read/write records but are escape hatches:
- Require SSH — not remote-friendly
- `bench execute` uses `eval()` for args in legacy path — security risk
- Both **bypass Frappe ACL** — opposite philosophy to frappe-ctl (which enforces permissions)
- No stable JSON output contract for agent consumption

They are not substitutes for frappe-ctl; they're power-user debugging tools.

## Consequences

- ✅ frappe-ctl stays focused: one transport (HTTP), one auth model (API key / OAuth Bearer), one permission model (Frappe ACL)
- ✅ Works on Frappe Cloud Shared — the tier with zero bench access — without any workaround
- ✅ On self-hosted, users already have bench; frappe-ctl is additive (REST-based data ops), not a replacement
- ⚠️ Infra operations (trigger migrate, force backup) not available via frappe-ctl — use bench directly on self-hosted, or Cloud API on Frappe Cloud
- ⚠️ If Cloud API integration is added later (Phase 3+), it should be a separate `frappe-ctl cloud` subcommand with a distinct Press token credential, not mixed into the per-site profile system
