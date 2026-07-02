---
adr: "022"
title: "Exit code 4 = auth required — narrow scope, 403 excluded"
date: 2026-07-03
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [exit-codes, agent-native, chctl-inspired]
---

# ADR-022: Exit code 4 = auth required, narrower than chctl's 401+403

## Decision
`frappe-ctl` exits with code `4` (not the generic `1`) when: (a) no active profile is configured or the named profile doesn't exist (`AuthRequiredError` from `config.ts::getActiveProfile`), or (b) the server responds `401 Unauthorized`. HTTP `403 Forbidden` stays exit `1`, even though it's sometimes auth-related.

## Context
Chctl-inspired (`ROADMAP.md` Functional bucket) — `gh`-style exit codes: `0` success, `1` error, `2` cancelled, `4` auth required, letting an agent branch on exit code instead of parsing stderr text. chctl's own `Error::exit_code()` maps both HTTP 401 *and* 403 to auth-required.

That mapping doesn't transfer cleanly to Frappe. Frappe returns 403 for two different situations: an actually-invalid session, and `PermissionError` — a fully authenticated user simply lacking permission on a DocType (confirmed by existing test fixtures, e.g. `client.test.ts`'s "throws FrappeRequestError on 403" case uses `exc_type: "PermissionError"`). If frappe-ctl mapped 403 to exit 4 the way chctl maps its Cloud API's 403, an agent hitting a permission wall would be told "re-authenticate," retry the same failing operation after a no-op re-auth, and loop — the actual fix (request DocType access, or ask a human) never gets surfaced.

401 is unambiguous — Frappe only returns it when the session/token itself is invalid, so re-auth is always the right next step. Missing/misnamed local profile is equally unambiguous — nothing can succeed until `profile add`/`profile use` fixes it.

Distinguishing "403 that's really an auth failure" from "403 that's a genuine permission wall" would require capturing Frappe's `exc_type` as a structured field (currently merged into the `serverMessage` string) and trusting Frappes's own error taxonomy is applied consistently server-side — considered and explicitly rejected for now as disproportionate complexity for an edge case; can be revisited if it turns out to matter in practice.

## Consequences
- ✅ `AuthRequiredError` (new, `src/errors.ts`) is thrown by `config.ts::getActiveProfile`, imported by both `config.ts` and `cli.ts` — no circular dependency with `client.ts`
- ✅ `exitCodeFor(err)` in `cli.ts` is a pure, exported function (same pattern as `isVerbAllowed`, ADR-018) — unit-testable without spawning a subprocess or touching `process.exit`
- ✅ `die()` now takes an optional exit-code parameter (default `1`) so the two local `getActiveProfile` catch sites (`mcp` command, main verb router) can also exit `4` instead of only the top-level `main().catch` path
- ⚠️ An agent seeing exit `1` on a 403 must still read the error message to know whether it's a permission wall — no exit-code shortcut for that case, by design
- ⚠️ If Frappe's `exc_type` taxonomy is later found reliable enough to split 403 correctly, this ADR should be revisited rather than silently reinterpreted
