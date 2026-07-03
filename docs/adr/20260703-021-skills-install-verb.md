---
adr: "021"
title: "skills install verb — non-interactive, detected-only default"
date: 2026-07-03
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [skills, distribution, agent-native, chctl-inspired]
---

# ADR-021: `skills install` verb — non-interactive, detected-only default

> **Amended by [ADR-028](20260704-028-skill-install-nested-directory.md):** the exact installed format described below (flat `frappe-ctl.skill.md` file) turned out not to match what any Agent-Skills-standard-compliant tool actually auto-discovers — corrected there to `<target>/frappe-ctl/SKILL.md`. The scope-default decision (non-interactive, `--detected-only`) and agent-path list below are unaffected and still accurate.

## Decision
`frappe-ctl skills install` copies the skill file into agent-specific skill dirs (`.claude/skills/`, `.codex/skills/`, etc — 16 total, plus a common `.agents/skills/` path always included). With no flags, it defaults to installing only into agent dirs already present in the target root (`--detected-only` semantics) — never prompts. `--all`, `--agent <name>` (repeatable), and `--global` (home dir instead of cwd) override the default.

## Context
Inspired by `clickhousectl skills` (see `ROADMAP.md` chctl-inspired section), which installs its own skill file into the same style of per-agent directory. chctl's default behavior is interactive — prompts a human to pick scope and agents when no flags are given.

frappe-ctl cannot copy that default. ADR-established agent-native principles (`CLAUDE.md` — "Non-interactive: No prompts. `--force` for destructive ops.") rule out any prompt-based UX; every command must behave identically whether invoked by a human or an agent shelling out. A prompt with no input stream to read from would hang indefinitely under agent invocation.

The alternative defaults considered:
- **Do nothing without an explicit flag** (require `--all`/`--detected-only`/`--agent` every time) — safest, but friction-heavy for the common case (a human running the installer once in a fresh project).
- **Default to `--all`** — installs into every one of 16 dirs unconditionally, cluttering projects that only use one or two agent tools with dead `.roo/`, `.trae/`, etc directories.
- **Default to `--detected-only`** (chosen) — installs only where an agent's own dir already exists (signal the tool is actually in use in that project), always including the common `.agents/skills/` path regardless. Non-interactive, safe, and doesn't create clutter for tools not in use.

Agent-path list matches chctl's supported set exactly (`claude`, `codex`, `cursor`, `opencode`, `agent`, `roo`, `trae`, `windsurf`, `zencoder`, `neovate`, `pochi`, `adal`, `openclaw`, `cline`, `command-code`→`.kiro/`, `kiro-cli`→`.kiro/`) — kept in sync manually since there's no shared registry between the two tools; revisit if the list drifts from what agents actually expect.

## Consequences
- ✅ Identical behavior for human and agent invocation — no hang risk, no interactive-mode branch to maintain
- ✅ Detected-only default avoids cluttering projects with skill dirs for tools not in use
- ✅ `--global` reuses the same cwd/home distinction pattern as `config.ts`/`token-store.ts` (functions read env/args at call time, not module-load time — ADR-004)
- ⚠️ Detection is directory-existence-based (`.claude/` exists → assume Claude Code is used here) — a false positive is possible if a directory was created for unrelated reasons; false negative if an agent is configured without ever having created its dir yet. Acceptable tradeoff: `--all`/`--agent` are always available as an explicit override.
- ⚠️ Agent-path list is a manually maintained copy of chctl's — will drift if chctl adds/removes agents and this list isn't updated alongside
