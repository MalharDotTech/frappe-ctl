---
adr: "005"
title: "listDocTypes uses POST frappe.client.get_list, not GET /api/resource/DocType"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [http, frappe-quirk, doctypes]
---

# ADR-005: `listDocTypes` uses POST, not GET

## Decision
`listDocTypes()` calls `frappe.client.get_list` via POST (`/api/method/frappe.client.get_list`) instead of `GET /api/resource/DocType`.

## Context
Two bugs hit with the GET path: (1) `is_single` field is not in Frappe's `frappe.client.get_list` allowlist — requesting it returns HTTP 417. (2) Filtering by 10+ modules produces a URL that exceeds server-side length limits, also returning 417. POST body has no length limit. Switching to POST with modules as a comma-string `in` filter fixes both.

## Consequences
- ✅ No URL length issues regardless of module count
- ✅ `is_single` removed from the fields list — server accepts the request cleanly
- ⚠️ Slightly non-obvious — `GET /api/resource/DocType` seems natural but breaks at scale
