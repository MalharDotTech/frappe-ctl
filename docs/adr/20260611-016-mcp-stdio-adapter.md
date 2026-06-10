---
adr: "016"
title: "MCP stdio adapter — typed tools, read-only by default, mutations behind opt-in"
date: 2026-06-11
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [mcp, agents, safety, auth]
---

## Decision

Add a Model Context Protocol stdio server at `src/mcp-server.ts`, exposed as `frappe-ctl mcp [--allow-mutations]`. Read-only tools always available; mutation tools gated behind `--allow-mutations` flag.

## Context

MCP is the standard protocol for connecting LLM agents to typed tools. Exposing frappe-ctl verbs as MCP tools lets agents use Claude's native tool-calling interface instead of shell invocations. The read-only default follows the principle of least privilege — most agent sessions (planning, analysis, reporting) need no write access, and accidental mutation in a planning session is unrecoverable.

Tool set is scoped to the highest-value verbs; not a 1:1 mapping of all 21 CLI verbs. Rationale: smaller tool surface = fewer tokens in tool descriptions, fewer routing mistakes by the LLM.

**Read-only tools (always):** `frappe_get`, `frappe_count`, `frappe_search`, `frappe_describe`, `frappe_validate`

**Mutation tools (--allow-mutations only):** `frappe_create`, `frappe_patch`, `frappe_delete`

Never expose a generic `bash` or `call` tool — too broad, no type safety, no audit trail.

## Consequences

✅ Agents can use native tool-calling instead of shell invocations  
✅ Read-only default prevents accidental writes during analysis sessions  
✅ `--allow-mutations` is explicit — humans must consciously opt in  
✅ Tool schemas are typed (JSON Schema) — client validates inputs before dispatch  
⚠️ `frappe_validate` makes a meta fetch per call — no caching by design (see existing ADR on no meta caching)  
⚠️ `frappe_search` makes 2 calls when `field` not specified (meta + list) — document in tool description  
⚠️ MCP stdio server consumes stdin — cannot be combined with other stdin consumers in same process
