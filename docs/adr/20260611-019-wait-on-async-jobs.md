---
adr: "019"
title: "--wait on call verb — poll Frappe background job until terminal state"
date: 2026-06-11
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [agents, async, frappe-quirk, call]
---

## Decision

Add `--wait` to the `call` verb only. If the response contains a `job_name` string field, call `client.waitForJob()` which polls `frappe.utils.background_jobs.get_info` until status is `finished`, `failed`, or `not_found`. On `failed`, throw so the agent sees a non-zero exit. On `finished`, output `info.result` instead of the original job envelope.

## Context

Certain ERPNext methods are async by design — they enqueue a background job and return `{job_name, status:"queued"}` immediately. Without `--wait`, the agent receives the job envelope and must implement its own polling, often incorrectly. Only `call` is affected: `get`/`patch`/`create`/`delete` are synchronous REST ops that return final state immediately. Adding `--wait` to other verbs would be dead code.

`waitForJob` is on `FrappeClient` rather than in `call.ts` so the MCP server and future verbs can reuse it. Poll interval (2000ms) and timeout (60000ms) are configurable in `opts` — tests use `intervalMs: 0`.

Frappe terminal states: `finished`, `failed`, `not_found`. `started`, `queued`, `deferred` are non-terminal.

## Consequences

✅ Agents get final job result without implementing polling  
✅ Blocked until terminal state — clean composition with `&&` in shell pipelines  
✅ `waitForJob` on client — reusable by MCP server  
⚠️ Default 60s timeout may be too short for heavy ERPNext jobs (stock reconciliation, period close)  
⚠️ `--wait` on a method that is NOT async is a no-op (no `job_name` in response) — silently does nothing, which is correct  
⚠️ `frappe.utils.background_jobs.get_info` takes `{job_id}` — parameter name may differ across Frappe versions
