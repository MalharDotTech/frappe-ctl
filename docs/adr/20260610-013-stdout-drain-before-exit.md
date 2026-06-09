---
adr: "013"
title: "Explicit stdout drain before process exit to fix Bun pipe truncation"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [bun-quirk, stdout, reliability]
---

# ADR-013: Explicit stdout drain before process exit

## Decision

`main()` ends with:
```typescript
await new Promise<void>((resolve) => process.stdout.write("", resolve));
```

## Context

Bun 1.3.x has two distinct 64KB bugs:

1. **ADR-012**: `res.text()` truncates HTTP responses at 64KB (fixed with `arrayBuffer()`).
2. **This ADR**: `process.stdout` doesn't drain before exit when stdout is a pipe — truncates output at 64KB (OS pipe buffer size).

Discovered after ADR-012 fix: `describe "Sales Order" > file` produced 355KB valid JSON; the same command piped to `| python3 -m json.tool` received exactly 64KB and failed parsing. File redirect uses a different OS flush path, so it was unaffected.

`process.stdout.write("", callback)` with an empty string triggers no visible output but causes Bun to call the callback only after the underlying write buffer is fully drained — even across a pipe. The `await`-wrapped promise then holds the async chain open until flush completes, preventing premature exit.

## Consequences

- ✅ Large JSON output (describe 355KB, resources, agent-context) fully reaches piped consumers (`jq`, `python3`, LLM tool callers)
- ✅ Zero impact on TTY output or file redirect — both already flushed before this point
- ✅ No extra output — empty string write is a no-op for content
