# frappe-ctl — Agent Instructions

This repo contains the `frappe-ctl` CLI. If you're operating ERPNext via this tool, read `frappe-ctl.skill.md` for the full operator reference.

Quick rules for agents modifying **this codebase** (not using it as a CLI):
- Read `CLAUDE.md` before touching code — dev conventions, ADR process, testing patterns
- Write tests first (TDD). Never add code without a failing test.
- Auth header is `Authorization: token key:secret` — not Bearer, not Basic
- `die(msg)` for fatal errors. `process.exit` only in `validate.ts` and `main().catch`
- New design choice → create ADR in `docs/adr/` before or alongside the code

For operating ERPNext with this CLI → see `frappe-ctl.skill.md`.
