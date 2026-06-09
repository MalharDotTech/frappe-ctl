---
adr: "007"
title: "delete verb requires --force flag"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [safety, agent-native, cli]
---

# ADR-007: `delete` (and `bulk delete`) requires `--force`

## Decision
`cmdDelete` and `cmdBulk` with `subVerb=delete` throw if `force: false`. No silent deletion ever.

## Context
CLI tools used by agents must have hard gates on irreversible operations. An agent calling `delete` without user confirmation should be blocked at the tool level, not relying on the agent's judgment. `--force` makes the intent explicit in every shell history, log, and agent trace. Applies to single `delete` and `bulk delete` equally.

## Consequences
- ✅ No accidental deletions from agents, scripts, or fat-fingered commands
- ✅ Audit-friendly — `--force` always visible in logs
- ⚠️ One extra flag required for valid deletes — acceptable UX cost for safety
