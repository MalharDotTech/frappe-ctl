---
adr: "027"
title: "SKILL.md is the single canonical skill file, frontmatter stripped on install"
date: 2026-07-04
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.3.0"
tags: [skills, distribution, skills-sh]
---

# ADR-027: `SKILL.md` is the single canonical skill file

> **Amended by [ADR-028](20260704-028-skill-install-nested-directory.md):** the "installed copy" half of this decision (frontmatter stripped, flat unique filename) was itself wrong — corrected there. The "single canonical `SKILL.md` at repo root" finding below still holds.

## Decision
Repo root carries exactly one skill file, `SKILL.md`, with YAML frontmatter (`name: frappe-ctl`, `description: ...`) followed by the full operator reference as its body. `skills install` reads this file and installs a copy into each target agent directory (see ADR-028 for the corrected installed format).

## Context
Investigated what "push to frappe-ctl to skills.sh" (`ROADMAP.md` Distribution bucket) actually requires. Finding: skills.sh has no submission process — its `npx skills add <owner>/<repo>` CLI (github.com/vercel-labs/skills) pulls directly from any public git repo. The only requirement is discoverability in the shape their CLI expects: a file literally named `SKILL.md` with YAML frontmatter, found at repo root or under `skills/<name>/`.

The repo previously shipped `frappe-ctl.skill.md` — deliberately named that way (superseded reasoning below), no frontmatter — which satisfied none of that. First pass at fixing this (superseded by this ADR) added a second file, `SKILL.md`, kept byte-identical to `frappe-ctl.skill.md` via a test. That was wrong: it's pure duplication for no reason once you separate two things that don't actually need to be coupled — the *canonical source* of the content, and the *filename installed into shared agent directories*.

The real constraint was never "the source file must be named `frappe-ctl.skill.md`" — it was "the *installed* copy must be named uniquely, not `SKILL.md`, because agent skill directories (`.claude/skills/`, `.codex/skills/`, etc) are shared across tools, and a generic `SKILL.md` installed flat there would collide with any other tool's own file of the same name." That constraint applies only at install time, in `skills.ts`. It says nothing about what the checked-in source file is called.

So: one file, `SKILL.md`, is canonical. `skills.ts` decouples `SOURCE_FILE_NAME` (`SKILL.md`, read from) from `INSTALLED_FILE_NAME` (`frappe-ctl.skill.md`, written to) — previously a single constant did both jobs. Frontmatter is stripped on install since it's metadata for skills.sh's discovery mechanism, not operator content; installed copies look exactly as `frappe-ctl.skill.md` always did.

Every reference to a checked-in `frappe-ctl.skill.md` file was updated to `SKILL.md`: `package.json`'s `files` list (this is what actually ships in the npm tarball now), `AGENTS.md`, `.cursor/rules/frappe-ctl.mdc`'s `@frappe-ctl.skill.md` import (would have silently broken — that file no longer exists in the repo), README, `docs/site/index.html` and `quickstart.html`. References to the *installed* filename (`.claude/skills/frappe-ctl.skill.md` after running `skills install`) were left alone — that part didn't change.

## Consequences
- ✅ One source of truth — no drift risk to guard against, because there's nothing to drift from
- ✅ `npx skills add MalharDotTech/frappe-ctl` works — repo root satisfies skills.sh's discovery requirement
- ✅ `skill-file.test.ts` guards verb-set freshness (ADR-025) and asserts `SKILL.md`'s frontmatter shape
- ⚠️ Manual per-platform setup instructions (paste into ChatGPT, `@SKILL.md` in Claude Code) reference a file with frontmatter at the top — three harmless YAML lines a human or agent just skips past, not a functional problem
- ⚠️ Superseded the previous version of this ADR (two-files-kept-in-lockstep), written and reverted within the same work session before merge — no external consumers were ever affected
- ⚠️ See ADR-028 for what this ADR got wrong about the installed-copy format, and the correction
