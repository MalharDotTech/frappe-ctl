---
adr: "017"
title: "validate --output json — structured stdout for agent pipeline branching"
date: 2026-06-11
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [agents, validate, output, token-efficiency]
---

## Decision

Add `--output json` to `validate` that writes `{"valid":bool,"required":[...],"missing":[...],"unknown":[{field,suggestion}]}` to stdout and preserves exit codes (0 = valid, 1 = invalid).

## Context

`validate` previously wrote MISSING/UNKNOWN only to stderr and exited 1. Agents can branch on exit code alone, but structured stdout enables richer workflows: surface missing fields to the user, auto-suggest corrections, pass the result to another tool. Without JSON output, agents must parse stderr (fragile) or trust the exit code alone (coarse). The `--output json` pattern matches `describe`, `report`, and other output-selectable verbs — consistent with the output model already established.

Exit code is not changed — operators that only check exit code still work.

## Consequences

✅ Agents get structured `{valid, required, missing, unknown}` without parsing stderr  
✅ `suggestion` field on each unknown entry surfaces Levenshtein correction without extra round-trip  
✅ Exit code unchanged — backward compatible  
⚠️ Stdout on failure now has data (JSON) — callers must not assume stdout is empty on exit 1
