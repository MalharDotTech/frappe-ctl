# Roadmap

Working items, bucketed by what they impact. Buckets are the unit of planning — each item tags its bucket so impact is obvious at a glance. ADRs remain the source of truth for design decisions already made; this file does not override `docs/adr/`, it's where new candidates get scoped before becoming one.

Current release cycle leads with **Functional** — the tool should get materially more agent-capable before it gets more visible or more polished.

---

## Buckets

### Functional
Core CLI capability — new verbs, flags, or behavior that change what the tool can do.

- [x] `skills install` verb — install `frappe-ctl.skill.md` into agent-specific dirs (`.claude/skills/`, `.codex/skills/`, `.cursor/skills/`, etc, 16 total + common `.agents/skills/`). Chctl-inspired. Non-interactive, `--detected-only` default — see ADR-021. Turns the skill file from a doc into a real distribution mechanism. Unblocks the skills.sh push.
- [x] Exit code `4` = auth-required, distinct from generic `1`. Chctl-inspired, but scope narrowed after review — only `401` + missing/invalid local profile map to `4`; `403` deliberately stays `1` since Frappe also uses it for plain `PermissionError` with a valid session (see ADR-022). New `AuthRequiredError` type + `exitCodeFor()` pure function (`cli.ts`).
- [x] Agent env-var auto-detect → force JSON output even when `process.stdout.isTTY` is true. Chctl-inspired. Env var list pulled from the real `is-ai-agent` crate source, not guessed (ADR-023). New `agent-detect.ts::isAgentInvocation()`, wired into `output.ts::detectFormat()` ahead of the TTY check.
- [x] `--debug` flag — print resolved profile + auth source to stderr before running. Chctl-inspired. Never prints raw credentials — constraint pre-set by ADR-020, regression-tested (ADR-024). Main verb router only, not `mcp`/`auth`/`profile`.
- [ ] Prompt→command→output usage analysis — **scoped, deliberately parked until real external usage exists.** Real intent (clarified 2026-07-03): capture the full loop — user's English prompt, the agent's resulting `frappe-ctl` invocation, and its output — to drive future feature/token-efficiency decisions from real usage, not guesswork. Structurally, `frappe-ctl` itself can't capture this: it only ever sees its own argv, never the prompt that led to it — that data lives in the calling agent's own session transcripts, not in anything frappe-ctl could log about itself. Confirmed feasible for Claude Code specifically — its session `.jsonl` transcripts (e.g. `~/.claude/projects/<project>/*.jsonl`) do contain `tool_use` blocks with `name: "Bash"` and `input.command` holding exact `frappe-ctl` invocations, correlated with the preceding prompt and result. Real costs found before committing to build: Claude-Code-only (Cursor/Codex/other agents persist transcripts differently or not at all), the schema is undocumented/unstable (not a published API), and privacy filtering is real work (session files carry unrelated conversations + real business data from genuine usage, e.g. actual Customer names). Decision: not worth building now — almost all current "usage" is this dev session building the tool itself, which would make any analysis circular. Revisit once frappe-ctl has actual third-party users generating volume worth analyzing. If/when revisited: a separate dev-only script (e.g. `scripts/analyze-usage.ts`), never shipped in the npm package — bundling "read Claude Code's full conversation history" into a public CLI would be a real privacy/scope problem for any other installer.

### Security
Credential handling — the raw API key/secret and OAuth tokens must never be reachable by an agent's logs or context, only by `frappe-ctl` itself acting on the agent's behalf. Researched how comparable CLIs handle this (sources below).

- [x] **`config.json` file-mode fix** — `saveConfig()` now writes `0o600`, matching `token-store.ts`. Merged in PR #2.
- [x] **ACL trust-scope spike** — tested empirically: `security add-generic-password` (no `-T`/`-A`) gives **zero real process-scoping**. An item was read back silently, no prompt, from a completely unrelated fresh subshell — macOS trusts whichever process calls the Keychain API, always `/usr/bin/security` itself, not `frappe-ctl`. True per-process ACL scoping (the gogcli-style guarantee) needs a compiled+signed binary and native Security.framework calls — macOS-only, multi-week effort. **Decision: out of scope for now**, see ADR-020. If revisited later, it gets its own ADR and is scoped as a dedicated project, not folded into routine roadmap work.
- [x] **Target redefined as code-level, not OS-level** — given the ACL spike result, the real guarantee to hold is: raw secrets never appear in anything `frappe-ctl` prints (stdout/stderr/errors/logs), regardless of which process reads the Keychain directly. A full audit confirmed this already held across the codebase — zero leak paths found. Formalized in ADR-020, with a regression test (`client.test.ts`) guarding it going forward.
- [x] **Silent-fallback anti-pattern fixed** — `token-store.ts::saveToken()` now warns to stderr when a Keychain write fails for a reason other than deliberate opt-out (`FRAPPE_CTL_NO_KEYCHAIN=1`). `gh` CLI shipped this exact bug (cli/cli#8954, #7757) and had to walk it back; fixed proactively here instead.
- [x] **Headless/CI parity confirmed** — `FRAPPE_CTL_NO_KEYCHAIN=1` matches the pattern gogcli uses (`GOG_KEYRING_BACKEND=file`) — no change needed, shape was already right.
- [x] **ADR-020 written** — `docs/adr/20260703-020-credential-leak-boundary.md` — documents the code-level-vs-OS-level split, the spike result, the audit result, and constrains any future `--debug` flag to never print raw secret values.
- [ ] **`api_key`/`api_secret` Keychain-routing** — downgraded from "urgent gap" to nice-to-have. Given the ACL spike proved Keychain doesn't add process-isolation value over a `0o600` file on a single-user machine, the main remaining benefit is at-rest encryption + parity with the OAuth token path. Not blocking; pick up opportunistically.

**Research sources:**
- [gogcli DeepWiki — Authentication & Security](https://deepwiki.com/steipete/gogcli/4-authentication-and-security) — uses `99designs/keyring` (Go), cross-platform (macOS Keychain / Linux Secret Service / Windows Credential Manager), key format `token:<client>:<email>`, `GOG_KEYRING_BACKEND={auto|keychain|file}` + `GOG_KEYRING_PASSWORD` for headless.
- [gogcli issue #206](https://github.com/steipete/gogcli/issues/206) — cautionary tale: `auth add` silently wrote an empty token when Keychain was locked in a headless session. Exactly the silent-fallback failure mode to avoid.
- [gh CLI — OAuth token in encrypted keychain (discussion #8980)](https://github.com/cli/cli/discussions/8980) and [issue #8954](https://github.com/cli/cli/issues/8954) — `gh` moved to `zalando/go-keyring`-backed secure storage as the *default*, `--insecure-storage` as explicit opt-out; writes two keychain entries (per-user + an empty-acct "active slot" pointer for `gh auth switch`).
- [node-keytar](https://github.com/atom/node-keytar) — closest to frappe-ctl's own runtime (Node/Bun ecosystem). Documents the actual ACL behavior: the process that *writes* a Keychain item is trusted for silent reads later; a *different* process reading the same item triggers the macOS permission dialog. This is the mechanism to lean on for "agent never sees the raw secret."

### Distribution
Getting the tool into more hands, more channels.

- [ ] `fctl` short alias — add second `bin` entry in `package.json` pointing at the same wrapper as `frappe-ctl`.
- [ ] Push to skills.sh — depends on `skills install` verb + a freshness-checked skill file (see Onboarding).
- [ ] Shell completions (bash/zsh/fish) — already tracked as Phase 3 in `CLAUDE.md`.
- [ ] Binary releases via `bun build --compile` + GitHub Actions — already tracked as Phase 3 in `CLAUDE.md`.

### Community / OSS Governance
Repo-as-project infrastructure, not code.

- [ ] GitHub repo setup: issue templates, Projects board, Wiki, this file linked publicly.

### Onboarding
First-run experience — what a new user or new agent sees before they've done anything.

- [x] Skill file freshness check — audit found zero current drift; built as an ongoing `bun test` guard (`skill-file.test.ts`), not a one-time fix, per discussion. Scoped to verb presence, not exhaustive flag parity — a skill file that mirrors `--help` 1:1 defeats its own token-efficiency purpose (ADR-025). Also closed a related gap: extracted `cli.ts`'s inline verb list into `CLI_VERBS`, cross-checked against `agent-context.ts::VERBS` — the full chain (CLI router ↔ VERBS ↔ skill file) is guarded, not just one link. Unblocks skills.sh push.
- [ ] ASCII art on install — zero functional value, do whenever there's a spare 10 minutes.

### Fixes / Maintenance
Housekeeping — clears drift and stale state before new work lands on top of it.

- [x] ADR drift audit — 18/19 ADRs matched code exactly. One drift found (ADR-006's Consequences section described a stale `FrappeFilter` type) and fixed. PR #3.
- [x] Uncommitted `src/cli.ts` mode-bit change (100644→100755, no content diff) — discarded, file is never executed directly (always `bun run src/cli.ts`).

### Aesthetics / UX-AX
Visual and interaction polish. Deferred this cycle — not blocking release.

- [ ] `docs/site` HTML — apply a real design system, fix current ad-hoc styling.

---

## Chctl inspiration

[`ClickHouse/clickhousectl`](https://github.com/ClickHouse/clickhousectl) — official Rust CLI for ClickHouse, local + cloud. Reviewed README, `AGENTS.md`, and source (`main.rs`, `error.rs`, `user_agent.rs`, `skills.rs`, `update.rs`) for agent-experience patterns worth borrowing. Nothing here overrides an existing ADR — these are candidates, not decisions.

**Directly adopted into Functional bucket above:**
- `gh`-style typed exit codes (`0`/`1`/`2`/`4`) via a single `Error::exit_code()` method — one source of truth instead of scattered `process.exit()` calls. Their `error.rs` is the clean reference: enum variant → exit code, unit-tested per variant.
- `is-ai-agent` crate pattern — detects known coding-agent env vars (Claude Code, Cursor, Codex, Gemini CLI, Goose, Devin) and uses the result for **two** things at once: (1) forcing JSON output regardless of TTY state, (2) tagging the outbound `User-Agent` header (`clickhousectl/0.1.18 (agent=claude-code)`) for server-side attribution. frappe-ctl only needs (1) now; (2) is a cheap bonus if `client.ts` ever wants usage visibility.
- `--debug` flag printing resolved credential source + API URL to stderr — their credential resolution order is explicit and documented (CLI flags → project file → session env → `.env` file → OAuth); frappe-ctl's `config.ts` already has an equivalent precedence, just not surfaced.
- Skill-installer verb (`clickhousectl skills`) — supports `--all`, `--detected-only`, `--agent <name>` (repeatable), `--global` vs project-scope. Their `skills.rs` is the structural blueprint: a static map of agent-id → target path (`.claude/skills/`, `.codex/skills/`, `.cursor/skills/`, `.windsurf/skills/`, etc, 15 total) plus a common `.agents/skills/` path always included.

**Considered, not adopted (documented so we don't re-litigate):**
- Background self-update check, throttled to once/24h, cached and shown after `--help`/`--version` — reasonable pattern but low value while distribution is npm-primary; users already get updates via `npm install -g`. Revisit if/when binary releases (Phase 3) ship.
- Local server lifecycle, cloud service CRUD, ClickPipes — no analog, ClickHouse-domain-specific.

**Not found in chctl at all:** nothing resembling jsonl conversation-history sorting or openspec-style usage-stats collection. That item's source is separate from chctl and still needs its own spec.

---

## Sequencing (this cycle)

1. ~~Security urgent fix — `config.ts` plaintext `api_key`/`api_secret` with no file-mode restriction~~ — done, PR #2
2. ~~Fixes — clear `cli.ts` mode-bit state, run ADR drift audit~~ — done, PR #3
3. ~~Security (remaining) — silent-fallback fix, Keychain ACL scoping spike, headless parity confirmation, new ADR~~ — done, see ADR-020
4. ~~Functional — `skills install` verb → exit code `4` → agent env-var detect → `--debug` flag~~ — done. Prompt→command usage analysis scoped and deliberately parked until real external usage exists (2026-07-03).
5. ~~Onboarding — skill file freshness check~~ — done, ADR-025
6. **Distribution** — skills.sh push, `fctl` alias *(next up)*
7. Community/OSS + Aesthetics — next cycle
