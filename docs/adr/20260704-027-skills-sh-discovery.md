---
adr: "027"
title: "SKILL.md added for skills.sh discovery, kept in lockstep with frappe-ctl.skill.md"
date: 2026-07-04
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.3.0"
tags: [skills, distribution, skills-sh]
---

# ADR-027: `SKILL.md` at repo root for skills.sh discovery

## Decision
Repo root carries a second file, `SKILL.md`, with YAML frontmatter (`name: frappe-ctl`, `description: ...`) whose body is byte-identical to `frappe-ctl.skill.md`. A test (`skill-file.test.ts`) enforces that identity so the two files can never silently drift apart.

## Context
Investigated what "push to frappe-ctl to skills.sh" (`ROADMAP.md` Distribution bucket) actually requires. Finding: skills.sh has no submission/approval process at all — its `npx skills add <owner>/<repo>` CLI (github.com/vercel-labs/skills) pulls directly from any public git repo. There is nothing to "push"; the only requirement is that the repo be discoverable in the shape their CLI expects.

That shape is specific: "Skills are directories containing a `SKILL.md` file with YAML frontmatter" containing required `name` and `description` fields. Discovery checks the repo root first, then a fixed list of `skills/` and agent-specific subdirectories. Our existing `frappe-ctl.skill.md` — deliberately named that way per ADR-021, shipped by our own `skills install` verb, tested by `skill-file.test.ts` — satisfies none of this: wrong filename (case-sensitive `SKILL.md` required), no frontmatter.

Renaming `frappe-ctl.skill.md` to `SKILL.md` was rejected: it's referenced throughout the codebase (`skills.ts`'s `SKILL_FILE_NAME` constant), CLAUDE.md, README, the skill-file freshness tests, and every ADR from 021 onward. Changing it to satisfy one external ecosystem's naming convention would be a larger, riskier change for no functional gain over adding a second, purpose-built file.

The two-file approach creates an obvious drift risk — skills.sh's CLI copies `SKILL.md`'s body verbatim into whichever agent installs it, so a stale copy would silently serve outdated instructions. Closed the same way prior freshness risks were closed (ADR-025): a test, not a manual reminder. `skill-file.test.ts` strips `SKILL.md`'s frontmatter and asserts the remainder is exactly `frappe-ctl.skill.md`'s content — verified working by deliberately introducing drift and confirming the test caught it before restoring.

`SKILL.md` is deliberately **not** added to `package.json`'s `files` list — it exists purely for GitHub-based skills.sh discovery, not for our own `skills install` verb (which reads `frappe-ctl.skill.md` specifically via `import.meta.dir`-relative path regardless of install method). Packaging it into the npm tarball would add nothing but bloat.

## Consequences
- ✅ `npx skills add MalharDotTech/frappe-ctl` now works — repo root satisfies skills.sh's discovery requirement
- ✅ `frappe-ctl.skill.md`'s existing naming convention, all its references, and its own freshness tests are untouched
- ✅ Drift between the two files is regression-tested, not manually maintained — verified the guard actually fires before relying on it
- ⚠️ Any future edit to `frappe-ctl.skill.md`'s content must also touch `SKILL.md` (or vice versa) — the test will fail the build if one is edited without the other, which is the intended friction
- ⚠️ Two files with the same operational content is inherent redundancy; acceptable given it's fully test-guarded and the alternative (renaming the canonical file) has wider blast radius
