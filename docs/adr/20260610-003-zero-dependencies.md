---
adr: "003"
title: "Zero runtime dependencies — pure Bun/TypeScript"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [architecture, dependencies, portability]
---

# ADR-003: Zero runtime dependencies

## Decision
No external npm packages in `dependencies`. Only `devDependencies` (TypeScript, `@types/bun`). Bun built-ins only: `fetch`, `Bun.serve`, `crypto`, `fs`.

## Context
Every npm dep is a supply-chain risk, a version conflict surface, and install friction for agent environments. Bun's standard library covers everything needed: HTTP (`fetch`), crypto (Web Crypto API), file I/O (`Bun.file`), local server (`Bun.serve` for OAuth redirect listener). `keytar` for OS keychain was explicitly rejected in favour of spawning the platform's native CLI (`security` on macOS, `secret-tool` on Linux).

## Consequences
- ✅ `bun install` installs only dev tooling — binary compiles clean
- ✅ No supply-chain attack surface in runtime path
- ⚠️ Platform-native CLI spawning for keychain is more brittle than a library — acceptable for v0
