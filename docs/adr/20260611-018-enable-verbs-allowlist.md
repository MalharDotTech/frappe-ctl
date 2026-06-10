---
adr: "018"
title: "--enable-verbs allowlist for sandboxed agent invocations"
date: 2026-06-11
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [agents, safety, cli]
---

## Decision

Add `--enable-verbs <comma-list>` flag. If set, any verb not in the list triggers `die()` before the verb router is reached. `isVerbAllowed()` exported as a pure function for testability.

## Context

Sandboxed agent sessions (e.g., read-only analysis pipelines, customer-facing demos, CI validation jobs) need a hard surface-area limit beyond `FRAPPE_CTL_READONLY=1`. READONLY blocks mutations but still exposes 21 verbs. `--enable-verbs get,count,describe` limits the agent to exactly those 3. Operators can pass this at spawn time and know the agent cannot stray outside the declared surface even if the LLM is prompted to try.

Applied after the READONLY check so that both guards can be composed. Gate is in `cli.ts` not in individual commands — single enforcement point.

## Consequences

✅ Hard surface-area limit composable with READONLY  
✅ `isVerbAllowed()` pure fn makes the gate unit-testable without mocking the full CLI  
✅ Clear error message: `Verb 'X' not in allowlist. Enabled: Y,Z`  
⚠️ Empty string blocks all verbs — `--enable-verbs ""` makes the CLI unusable (intentional; operator error)  
⚠️ Does not validate that allowed verbs are real verbs — typos silently produce a useless allowlist
