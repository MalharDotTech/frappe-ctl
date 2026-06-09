---
adr: "012"
title: "HTTP responses read via arrayBuffer() + TextDecoder, not res.text()"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [bun-quirk, http, reliability]
---

# ADR-012: HTTP responses read via arrayBuffer() + TextDecoder, not res.text()

## Decision

All HTTP response bodies in `client.ts` are read with:
```typescript
const text = new TextDecoder().decode(await res.arrayBuffer());
```
Never `await res.text()`.

## Context

Bun 1.3.x has a silent bug: `Response.text()` truncates the response body at exactly 65,536 bytes (64KB). No error is thrown — it returns a partial string and parsing fails mid-JSON.

Discovered during live testing against `cloudshapeddreamsstudio.m.erpnext.com`:
- `frappe-ctl next describe "Sales Order"` → `SyntaxError: Unterminated string`
- `curl` confirmed Frappe sends 251,513 bytes for the same request
- Bun received exactly 65,536 bytes

A mis-diagnosis led to a DocField workaround (fetch only field rows) which introduced a 403 on Frappe Cloud (system doctypes block REST reads by API key). Root cause was confirmed to be `res.text()`, not Frappe's response size.

`arrayBuffer()` accumulates all chunks regardless of size. `TextDecoder` handles UTF-8 correctly.

## Consequences

- ✅ Large DocType responses (Sales Order: 251KB, Project: similar) parse completely
- ✅ No functional change — same JSON, just read correctly
- ⚠️ Minor memory overhead for very large responses (full body in memory before parse) — acceptable; Frappe responses are never GB-scale
