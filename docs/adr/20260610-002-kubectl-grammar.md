---
adr: "002"
title: "kubectl-style grammar with app alias as second token"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [cli, grammar, agent-native]
---

# ADR-002: kubectl-style grammar — `frappe-ctl [--site] <app> <verb> <DocType> [name]`

## Decision
CLI grammar is `frappe-ctl [--site <profile>] <app> <verb> <DocType> [name] [flags]` where `app` is a short alias (`next`, `hr`, `crm`) scoping every command to the right module namespace.

## Context
Frappe hosts multiple apps (ERPNext, HRMS, CRM, Helpdesk, LMS). Without an app scope, DocType names collide and agents can't deterministically address resources. kubectl's `resource type` pattern is proven for agent + human use. The `app` token is position 2 (after optional `--site`) — never a flag — so it's always parseable without a flag library.

## Consequences
- ✅ Deterministic — agents never need disambiguation prompts
- ✅ Mirrors kubectl muscle memory for operators
- ⚠️ Slightly more verbose than `frappe-ctl get Customer` — intentional tradeoff for clarity
