---
adr: "025"
title: "Skill file freshness enforced via test, not pre-push bash parsing"
date: 2026-07-03
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [skills, testing, pre-push, onboarding]
---

# ADR-025: Skill file freshness is a `bun test`, not a bash pre-push check

## Decision
`src/skill-file.test.ts` asserts `frappe-ctl.skill.md`'s "Verb Reference" table names exactly the same verb set as `agent-context.ts::VERBS` (now exported) plus `agent-context` itself. "Fresh" means no verb missing and no stale verb left behind — it does **not** mean every flag/example is exhaustively mirrored. Enforced automatically because it's a normal test, and `scripts/pre-push` already runs `bun test` as its first check.

## Context
`ROADMAP.md`'s Onboarding bucket flagged skill-file freshness as blocking the `skills.sh` push, but left two things unresolved: whether to enforce it once or on every future change, and what "matches the live verb set" should actually mean.

Discussed and decided: ongoing enforcement, but scoped to verb *presence*, not full 1:1 parity with `--help`. A skill file exists to be compressed and agent-useful — `frappe-ctl.skill.md`'s own "Token Efficiency" section makes that the whole point. Enforcing exhaustive flag-level parity would pressure the file toward bloat and defeat that purpose; a missing or renamed *verb* is the actual failure mode worth catching automatically (an agent literally can't discover the capability exists), while a slightly-stale flag description is a much smaller, human-reviewable problem.

Two enforcement mechanisms were available: extend `scripts/pre-push` (bash) to grep both `cli.ts` and the skill file and diff them, or add a `bun test` file that does the same comparison in TypeScript. Chose the test: `scripts/pre-push`'s step `[1/7] Tests` already runs the full suite, so a test-based check gets pre-push enforcement for free without adding bash-side parsing logic (extracting a TS array's contents via `grep`/`sed` is fragile — a real import isn't). It also means the check runs on every `bun test` invocation during normal development, not just at push time, catching drift closer to when it's introduced.

Verified the enforcement actually works before relying on it: temporarily stripped one verb from the skill file's table, confirmed the test failed with a clear diff, restored, confirmed it passed again.

An audit at write time found zero drift — `agent-context.ts::VERBS` and `frappe-ctl.skill.md`'s table already matched exactly. This ADR is purely about the guard, not a fix.

## Consequences
- ✅ Drift is caught automatically on every `bun test` / pre-push, not just remembered manually
- ✅ No new bash parsing logic in `scripts/pre-push` — reuses the existing Tests step
- ✅ Scope stays proportionate: verb presence is checked, not exhaustive flag parity, so the skill file can stay curated
- ⚠️ Does not catch a verb whose *description* silently goes stale or misleading while its name stays correct — that's a human-review problem, not automatable cheaply
- ✅ Closed the obvious follow-on gap in the same PR: extracted `cli.ts`'s inline verb-router array into an exported `CLI_VERBS` constant and added a bidirectional check (`skill-file.test.ts`) that `agent-context.ts::VERBS` matches it exactly — the full chain (`cli.ts` router ↔ `VERBS` ↔ skill file) is now guarded, not just one link of it
