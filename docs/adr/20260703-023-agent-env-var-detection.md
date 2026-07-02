---
adr: "023"
title: "Agent env-var detection forces JSON output over TTY detection"
date: 2026-07-03
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [output, agent-native, chctl-inspired]
---

# ADR-023: Known agent env vars force JSON output, ahead of `isTTY`

## Decision
`output.ts::detectFormat()` checks for a set of known AI-coding-agent environment variables before falling back to `process.stdout.isTTY`. If any are present, output is JSON regardless of what `isTTY` reports. An explicit `--output`/`-o` flag still wins over both.

## Context
Chctl-inspired (`ROADMAP.md` Functional bucket, "is-ai-agent crate pattern"). ADR-008 established TTY-based format detection: table for a human terminal, JSON when piped. That assumption breaks when an agent harness attaches a pty to the child process it spawns — `isTTY` reports `true`, frappe-ctl prints a human table, and the agent (expecting JSON) gets unparseable output.

The env var list was pulled from the actual source of the `is-ai-agent` Rust crate (what `clickhousectl` uses for the same purpose) rather than guessed — `https://docs.rs/is-ai-agent/latest/src/is_ai_agent/lib.rs.html`. Ported the tool-specific presence-signal vars (`CLAUDECODE`, `CURSOR_AGENT`, `CODEX_SANDBOX`, `GEMINI_CLI`, etc — full list in `agent-detect.ts`) plus the generic `AGENT`/`AI_AGENT` fallback (the same convention chctl's README describes: "any tool that sets the standard `AGENT` env var").

Deliberately not ported: `is-ai-agent`'s session-ID/traceparent correlation fields and its file-signal detection (checking for `/opt/.devin` to catch Devin). Both exist in the crate to support outbound `User-Agent` tagging for server-side analytics — noted in `ROADMAP.md` as a "cheap bonus, not needed now." frappe-ctl only needs a boolean "is an agent invoking this" signal for the output-format decision, so porting the classification/correlation machinery would be scope beyond what this decision requires.

## Consequences
- ✅ Fixes a real correctness gap: pty-attached agent invocations now get JSON even though `isTTY` would say otherwise
- ✅ `isAgentInvocation()` (`src/agent-detect.ts`) is a small, independently testable pure function — reads `process.env` at call time (same pattern as `config.ts`, ADR-004), no module-load-time caching to fight in tests
- ✅ `--output table` still available as an explicit override if a human genuinely wants table output while an agent env var happens to be set (e.g. running frappe-ctl manually inside a Claude Code terminal)
- ⚠️ The env var list is a manually maintained snapshot of `is-ai-agent`'s source at time of writing — will drift as new agent tools ship or existing ones rename their vars; same maintenance burden already accepted for the `skills install` agent-path list (ADR-021)
- ⚠️ Does not tag the outbound `User-Agent` header the way `is-ai-agent`/chctl also does — `client.ts` still sends a plain header with no agent attribution; picking `isAgentInvocation()`'s result back up for that is a small follow-up if usage visibility is ever wanted
