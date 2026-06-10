---
adr: "014"
title: "--sparse and --strip-meta output filters for token reduction"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [output, agents, token-efficiency]
---

## Decision

Add `--sparse` and `--strip-meta` as global output filters applied in `output.ts` before any format (JSON/table/CSV). Both flags pass through `applyOutputFilters()` which applies them in order: strip-meta first, then sparse.

## Context

Measured on CSDS live site: Sales Order list (3 docs) = 9,655 bytes raw; same list with null/empty/zero stripped = 4,358 bytes — 55% reduction. Agents pay per token for every null field. Frappe returns 80–120 fields per doc; most are null for any given use case. System metadata fields (owner, creation, utm_*, etc.) are never needed by agents.

`sparseDoc` keeps zero values for semantic fields (`docstatus`, `qty`, `grand_total`, etc.) via a `KEEP_ZERO` allowlist.

## Consequences

✅ 55% token reduction on list queries with `--sparse`  
✅ Additional ~20 fields removed per doc with `--strip-meta`  
✅ Composable — both flags can be combined  
✅ Centralized in `output.ts` — every command that calls `printDoc`/`printDocs` inherits them  
⚠️ KEEP_ZERO list must be maintained as new numeric fields are added to ERPNext
