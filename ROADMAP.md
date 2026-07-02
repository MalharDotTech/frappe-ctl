# Roadmap

Working items, bucketed by what they impact. Buckets are the unit of planning — each item tags its bucket so impact is obvious at a glance. ADRs remain the source of truth for design decisions already made; this file does not override `docs/adr/`, it's where new candidates get scoped before becoming one.

Current release cycle leads with **Functional** — the tool should get materially more agent-capable before it gets more visible or more polished.

---

## Buckets

### Functional
Core CLI capability — new verbs, flags, or behavior that change what the tool can do.

- [ ] `skills install` verb — install `frappe-ctl.skill.md` into agent-specific dirs (`.claude/skills/`, `.codex/skills/`, `.cursor/skills/`, etc). Chctl-inspired (see below). Turns the skill file from a doc into a real distribution mechanism. **Blocks the skills.sh push.**
- [ ] Exit code `4` = auth-required, distinct from generic `1`. Chctl-inspired. Lets agents branch "need to re-auth" vs "generic failure" without parsing stderr text. Needs a typed error path in `client.ts` (currently flat `die()`).
- [ ] Agent env-var auto-detect → force JSON output even when `process.stdout.isTTY` is true. Chctl-inspired. Some agent harnesses attach a pty, so TTY-only detection can silently ship table output to an agent.
- [ ] `--debug` flag — print resolved profile/credential source + effective API URL to stderr before running. Chctl-inspired. Surfaces the config-precedence logic that already exists in `config.ts`.
- [ ] Conversation-history jsonl sorting + usage-stats collection (openspec-style) — **parked, scope undefined.** Not present in chctl; separate lineage. Needs a spec before sizing.

### Security
Credential handling — the raw API key/secret and OAuth tokens must never be reachable by an agent's logs or context, only by `frappe-ctl` itself acting on the agent's behalf. Researched how comparable CLIs handle this (sources below); findings split into an urgent fix and a design direction.

- [ ] **Urgent fix** — `config.ts::saveConfig()` writes `api_key`/`api_secret` to `config.json` as **plaintext with no file-mode restriction** (no `0o600`, unlike `token-store.ts::saveFileStore()` which does set it). This is the `token key:secret` self-hosted auth path (ADR-001) — it currently has *zero* Keychain protection; only the OAuth token path attempts Keychain-first. Two gaps to close: (1) match `token-store.ts`'s `0o600` mode on `config.json` at minimum, (2) route `api_key`/`api_secret` through the same Keychain-first path OAuth tokens already use, so both auth modes get equal protection.
- [ ] **Silent-fallback anti-pattern** — `token-store.ts::saveToken()` falls back to plaintext file store silently if the Keychain write fails, with no signal to the user. `gh` CLI shipped this exact bug (cli/cli#8954, #7757 — silently wrote plaintext even with keyring available) and had to walk it back with an explicit `--insecure-storage` opt-in flag, secure storage as the *default*. frappe-ctl should fail loud (or warn to stderr) on Keychain-write failure, not degrade silently.
- [ ] **Keychain ACL trust scope** — current `security add-generic-password` call (`token-store.ts`) passes no `-T`/`-A` flag, so the trust boundary of who can read the secret *without* a macOS password prompt is currently undefined/untested, not deliberately scoped. This is the mechanism behind the gogcli macOS-password-prompt behavior: an item's ACL lists which specific app(s) get silent access; anything outside that list triggers an OS prompt. Need to explicitly test and pin down what `-T <path>` scopes to for a Bun script invoked via `bin/frappe-ctl` (unsigned scripts can't get codesign-based ACL trust the way a compiled binary can — this needs a spike, not an assumption).
- [ ] **Headless/CI parity** — already have `FRAPPE_CTL_NO_KEYCHAIN=1` for file-only storage in CI, which matches the pattern gogcli uses (`GOG_KEYRING_BACKEND=file` + `GOG_KEYRING_PASSWORD` for non-interactive). No change needed here, just confirmed as the right shape.
- [ ] New ADR once the above is resolved — no existing ADR documents the token-storage security model as a deliberate decision; it's currently implemented ad hoc.

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

- [ ] Skill file freshness check — `frappe-ctl.skill.md` must match the live verb set exactly before it becomes the install artifact. **Blocks skills.sh push.**
- [ ] ASCII art on install — zero functional value, do whenever there's a spare 10 minutes.

### Fixes / Maintenance
Housekeeping — clears drift and stale state before new work lands on top of it.

- [ ] ADR drift audit — check current code against `docs/adr/` decisions, flag anything that's drifted.
- [ ] Uncommitted `src/cli.ts` mode-bit change (100644→100755, no content diff) — resolve (commit or discard) before other work touches that file.

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

1. **Security urgent fix** — `config.ts` plaintext `api_key`/`api_secret` with no file-mode restriction. Moved ahead of everything else: it's a live gap, not a roadmap aspiration.
2. Fixes — clear `cli.ts` mode-bit state, run ADR drift audit
3. Security (remaining) — silent-fallback fix, Keychain ACL scoping spike, headless parity confirmation, new ADR
4. Functional — `skills install` verb → exit code `4` → agent env-var detect → `--debug` flag
5. Onboarding — confirm skill file freshness (falls out of step 4)
6. Distribution — skills.sh push, `fctl` alias
7. Community/OSS + Aesthetics — next cycle
