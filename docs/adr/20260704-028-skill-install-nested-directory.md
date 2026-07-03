---
adr: "028"
title: "skills install writes the Agent Skills standard format — nested directory, not flat file"
date: 2026-07-04
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.3.0"
tags: [skills, distribution, bugfix]
---

# ADR-028: `skills install` writes `<target>/frappe-ctl/SKILL.md`, not a flat file

## Decision
`skills install` writes to `<agent-skills-dir>/frappe-ctl/SKILL.md` — a directory named after the skill, containing `SKILL.md` with its YAML frontmatter intact. It no longer writes a flat `<agent-skills-dir>/frappe-ctl.skill.md` file.

## Context
Corrects a real bug in ADR-021's original design, discovered while testing whether onboarding a new user via `npx skills add` + `frappe-ctl skills install` was actually seamless. Confirmed by directly comparing our installer's output against skills.sh's own installer's output for the same repo, and against Claude Code's published docs:

> "Each skill is a directory with `SKILL.md` as the entrypoint" — Claude Code docs, `/en/skills`
>
> "At its core, a skill is a folder containing a `SKILL.md` file." — agentskills.io, the open standard Claude Code, Cursor, Codex, Gemini CLI, and dozens of other tools implement

Our installer wrote `<target>/frappe-ctl.skill.md` — a flat file, wrong name, and (after ADR-027) no frontmatter. None of that matches the standard. Practically: Claude Code's project-skill loader specifically watches for `.claude/skills/<name>/SKILL.md`; a flat file sitting in `.claude/skills/` is invisible to it. The `skills install` verb's entire premise — "install so the agent picks it up automatically" — did not actually deliver automatic pickup for any standard-compliant agent. It only ever worked through the unrelated manual fallback (`@frappe-ctl.skill.md` in `CLAUDE.md`) that the README documents separately.

ADR-027's reasoning for keeping a uniquely-named flat file ("agent skill dirs are shared across tools, a generic `SKILL.md` installed flat there would collide") was itself built on a wrong model of how these directories work. The nesting *is* the collision-avoidance mechanism — each skill lives in its own subdirectory named after the skill, so `.claude/skills/frappe-ctl/SKILL.md` and `.claude/skills/some-other-tool/SKILL.md` coexist as siblings with zero collision risk. A unique flat filename was solving a problem the standard format doesn't have.

Frontmatter is now kept on install (previously stripped, per ADR-027) because agents need it: the Agent Skills standard's discovery mechanism is progressive — "at startup, agents load only the name and description of each available skill" (agentskills.io), read from frontmatter, before deciding whether to load the full body. Stripping it would have left every installed copy undiscoverable in the same way the flat-file bug did.

Verified before merging, not assumed: ran `npx skills add MalharDotTech/frappe-ctl -a claude-code` (the real, external tool) against the real repo and inspected its output directly — `.claude/skills/frappe-ctl/SKILL.md`, frontmatter intact. `skills.ts`'s corrected output now matches that exactly, checked by diff.

## Consequences
- ✅ `skills install` output now matches what Claude Code (and every other Agent-Skills-standard-compliant tool) actually discovers automatically — the verb's stated purpose since ADR-021 is now actually true
- ✅ Verified against a second, independent implementation (skills.sh's own installer) producing byte-identical structure, not just against documentation
- ⚠️ This is a behavioral regression fix to already-published npm `0.3.0` — anyone who ran `frappe-ctl skills install` before this fix has a stale, non-functional flat file sitting in their agent skills directory that should be removed and reinstalled. Worth a release note.
- ⚠️ Supersedes ADR-027's installed-copy design (frontmatter stripped, flat unique filename) while keeping its other finding intact — `SKILL.md` at repo root as the single canonical source, required for skills.sh's own repo-level discovery, is unaffected by this change
