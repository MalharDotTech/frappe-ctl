---
adr: "008"
title: "Output format defaults based on process.stdout.isTTY"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [output, agent-native, pipe-safe]
---

# ADR-008: TTY detection drives default output format

## Decision
When `process.stdout.isTTY` is true → default to table. When false (piped, redirected, agent subprocess) → default to JSON. Always overridable with `-o json|table|csv`.

## Context
Agents consume stdout programmatically — they need machine-readable JSON. Humans at a terminal want a readable table. The TTY check is the standard Unix pattern for this. Applying it on every command means the same binary works correctly whether run interactively or from an agent tool call. `die()` and progress messages always go to stderr so they never pollute stdout data.

## Consequences
- ✅ Pipe-safe by default — `frappe-ctl next get Customer | jq` just works
- ✅ Readable in terminal without `-o table` flag
- ⚠️ Agents must either pipe output or explicitly pass `-o json` — but piping is natural for agent shells
