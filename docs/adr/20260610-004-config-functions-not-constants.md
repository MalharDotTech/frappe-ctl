---
adr: "004"
title: "Config path helpers are functions, not module-level constants"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [config, testing, env]
---

# ADR-004: `configDir()` and `configFile()` are functions, not constants

## Decision
`configDir()` and `configFile()` in `config.ts` read `process.env.FRAPPE_CTL_CONFIG_DIR` at call time, not at module import time.

## Context
If these were `const configDir = process.env.FRAPPE_CTL_CONFIG_DIR ?? defaultPath`, the value would be frozen at import time. Tests that set `process.env.FRAPPE_CTL_CONFIG_DIR` in `beforeEach` would still read the original path because the module was imported before the env var was set. Making them functions ensures each test's temp dir is respected without needing module reload hacks.

## Consequences
- ✅ Test isolation — each test can inject a throw-away config dir
- ✅ `FRAPPE_CTL_CONFIG_DIR` works correctly in agent sessions (set once, used throughout)
- ⚠️ Tiny function-call overhead on every config access — negligible for a CLI
