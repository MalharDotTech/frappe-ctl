---
adr: "006"
title: "Frappe 'in' filter value must be a comma-string, not an array"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [frappe-quirk, filters, http]
---

# ADR-006: `in` filter takes comma-string, not array

## Decision
Frappe `in` filter value must be a comma-separated string: `["module", "in", "Accounts,Buying,Selling"]`. Passing a JS array causes HTTP 417.

## Context
Intuitive API design would accept an array. Frappe's server-side filter parser expects a string and uses Python's `split(",")` internally. Passing `["Accounts", "Buying"]` as the value serialises to JSON as an array, which the parser does not handle — it returns `DataError` (HTTP 417). Confirmed in `frappe/frappe` source. This only affects the `in` and `not in` operators.

## Consequences
- ✅ Works correctly once known
- ⚠️ Easy to regress — every caller building `in` filters must join with `,` not pass array
- ✅ `FrappeFilter` type in `client.ts` now types the value as plain `string` (not `string | string[]`) — the type system itself forces callers to join before passing, closing the regression risk above
