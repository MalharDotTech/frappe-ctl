---
adr: "001"
title: "Frappe auth header uses token not Bearer"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [auth, http]
---

# ADR-001: Frappe auth header uses `token key:secret`, not Bearer

## Decision
All self-hosted Frappe API calls use `Authorization: token <api_key>:<api_secret>`. Never `Bearer`, never `Basic`.

## Context
Frappe's REST API does not use standard OAuth Bearer tokens for API key auth. The header format is Frappe-specific. Using `Bearer` silently fails — server returns 403 with no helpful error. Discovered this early; now a hard rule enforced in `client.ts` constructor.

## Consequences
- ✅ Correct — only format Frappe actually accepts for API key auth
- ⚠️ Diverges from standard OAuth — every new transport layer must be briefed on this
- ⚠️ Frappe Cloud OAuth uses `Bearer <access_token>` — these are two separate code paths, never conflate
