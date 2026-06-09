---
adr: "011"
title: "OAuth redirect URI uses fixed port 8756, not random ephemeral port"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [auth, oauth, ux]
---

# ADR-011: OAuth redirect URI uses fixed port 8756, not random ephemeral port

## Decision

`frappe-ctl auth login` binds to port `8756` by default. Overridable with `--port <n>`. The redirect URI (`http://localhost:8756`) is always shown in setup instructions so users register exactly that URI once.

## Context

The original implementation picked a random port (49152–65535 range) on every run. Frappe OAuth requires **exact redirect URI match** — the URI registered in the OAuth Client must match the URI sent in the authorization request character-for-character. A random port means the registered URI (`http://localhost:53787`) never matches the next run's URI (`http://localhost:61234`), producing a 400 `invalid_request / Mismatching redirect URI` error in the browser before the user can even authorize. Discovered during first live test against `cloudshapeddreamsstudio.m.erpnext.com`.

The intent of random ports (avoid conflicts) is a valid concern but wrong priority — the breakage is guaranteed, port conflicts are rare and recoverable with `--port`.

Port `8756` was chosen as an arbitrary unused port above 1024, outside the IANA well-known range, and not commonly used by dev tools. No special significance.

## Consequences

- ✅ OAuth works — user registers `http://localhost:8756` once and every future `auth login` matches
- ✅ `--port <n>` escape hatch if 8756 is in use on the machine
- ⚠️ Two users on the same machine running `auth login` concurrently would conflict — accept this edge case, CLI auth is a rare one-shot operation
