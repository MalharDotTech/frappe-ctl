---
adr: "015"
title: "New read-only verbs for agent efficiency: count, search, link, validate, diff"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [agents, verbs, token-efficiency]
---

## Decision

Add five new read-only verbs: `count`, `search`, `link`, `validate`, `diff`.

## Context

Agent patterns requiring multiple expensive calls were identified from CSDS live usage:
- "How many open SOs?" → previously required `get` (20 docs × 88 fields) instead of `countDocs` which existed in `client.ts` but had no CLI surface
- "Find project for V Builders" → required fetching all projects and filtering locally
- "Get the project for SO-001" → required `get SO-001` then `get Project PROJ-X` (2 round-trips)
- "Will this payload work?" → required a create attempt (which might fail with cryptic 417)
- "What would this patch change?" → required mental diff of `get` output against proposed data

## Consequences

✅ `count` — wraps `client.countDocs()` (already implemented), outputs plain integer  
✅ `search` — 2 API calls (meta + list), auto-detects `title_field` from DocType meta  
✅ `link` — 3 API calls (doc + meta + linked doc), validates field is Link type  
✅ `validate` — 1 API call (meta), client-side only, Levenshtein typo suggestions  
✅ `diff` — 1 API call (current doc), read-only, shows only changed fields  
⚠️ `search` incurs meta fetch overhead when no `--field` is specified — use `--field` to reduce to 1 call  
⚠️ `link` always fetches meta to verify field type — no caching across calls
