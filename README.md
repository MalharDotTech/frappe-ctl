# frappe-ctl

[![npm version](https://img.shields.io/npm/v/frappe-ctl.svg)](https://www.npmjs.com/package/frappe-ctl)
[![license](https://img.shields.io/npm/l/frappe-ctl.svg)](LICENSE)
[![skills.sh](https://skills.sh/b/MalharDotTech/frappe-ctl)](https://skills.sh/MalharDotTech/frappe-ctl)

`kubectl`-style CLI for the Frappe ecosystem. One tool for every app built on Frappe — ERPNext, HRMS, CRM, Helpdesk, and more.

```
frappe-ctl [--site <profile>] <app> <verb> <DocType> [name] [flags]
```

The `app` alias scopes every command to the right module namespace. Humans and agents both get deterministic, token-efficient commands.

---

## Why

This started as a personal tool. A client and friend was getting onboarded onto ERPNext — a powerful system, but one with a steep learning curve. Explaining it through the UI felt slow. What actually worked was letting them describe what they wanted in plain language and having an AI agent translate that into precise API operations against their live site.

That required a clean, agent-friendly interface to ERPNext. Frappe's REST API is powerful but raw — every integration reimplements auth, filter syntax, output formatting, and profile management. `frappe-ctl` solves that once and exposes it through a grammar both humans and agents can reason about reliably.

The result is a tool built around one idea: **talking to ERPNext through AI should be as natural as talking to a colleague who knows the system.**

Design goals:
- **Agent-native** — JSON stdout by default when piped, token-efficient output filters, pre-flight ops before writes
- **Deterministic grammar** — `app verb DocType [name]`, inspired by `kubectl` — LLMs route to the right verb consistently
- **No dependencies** — pure Bun/TypeScript, zero external packages, fast startup
- **Multi-site** — named profiles, `--site` override, sandboxed config via `FRAPPE_CTL_CONFIG_DIR`
- **MCP-ready** — `frappe-ctl mcp` starts a stdio server exposing typed tools for Claude, Cursor, and any MCP host

---

## Supported Apps

| alias | App | Stable |
|-------|-----|--------|
| `next` | ERPNext | v16 |
| `hr` | Frappe HRMS | v16 |
| `crm` | Frappe CRM | v2 |
| `hd` | Frappe Helpdesk | v2 |
| `lms` | Frappe LMS | v2 |
| `bi` | Frappe Insights | v3 |
| `loan` | Frappe Lending | v2 |
| `health` | Frappe Healthcare | v16 |
| `edu` | Frappe Education | v16 |
| `frappe` | Frappe (core) | v16 |

---

## Install

```bash
bun add -g frappe-ctl
```

Or with npm/npx (no global install):

```bash
npx frappe-ctl next get Customer
```

Requires [Bun](https://bun.sh) ≥ 1.3.0.

Also installs as `fctl` — shorter for repeated invocations, identical behavior.

**For development / contributing:**

```bash
git clone https://github.com/MalharDotTech/frappe-ctl
cd frappe-ctl
bun install
bun run src/cli.ts next get Customer   # run from source
```

Full docs and quickstart: **[ctl.malhar.tech](https://ctl.malhar.tech)**

---

## Auth

Frappe uses `token key:secret` — not Bearer, not Basic. Get your API key and secret from **User Settings → API Access** in Frappe.

```bash
frappe-ctl profile add prod \
  --url https://yoursite.erpnext.com \
  --key <api_key> \
  --secret <api_secret>

frappe-ctl profile use prod
```

Config lives at `~/.config/frappe-ctl/config.json`. Override location with `FRAPPE_CTL_CONFIG_DIR`.

Troubleshooting multi-profile setups: `--debug` prints the resolved profile name + URL and which auth path is active (OAuth bearer or `api_key:api_secret`) to stderr before the command runs. Never prints the credential value itself.

---

## Verbs

### Read verbs

| Verb | What |
|------|------|
| `get` | List docs or fetch one by name |
| `count` | Count docs matching a filter — returns a plain integer |
| `search` | Text search within a DocType by title/name field |
| `describe` | Show DocType schema and field types |
| `link` | Follow a Link field and return the linked doc in one call |
| `validate` | Pre-flight check: verify `--data` has all required fields (no write) |
| `diff` | Show what fields would change if `--data` were patched (no write) |
| `resources` | List all DocTypes for an app |
| `logs` | Tail Frappe Error Log |
| `report` | Run a saved Frappe Report |

### Write verbs

| Verb | What |
|------|------|
| `apply` | Create or update doc from JSON file (kubectl-style) |
| `create` | Create a new doc from inline `--data` |
| `patch` | Update fields on an existing doc |
| `delete` | Delete a doc (requires `--force`) |
| `submit` | Submit a doc (docstatus 0 → 1) |
| `cancel` | Cancel a submitted doc (docstatus 1 → 2) |
| `workflow` | Apply an ERPNext workflow action (approve/reject/etc) |
| `call` | Call any whitelisted Frappe method |
| `attach` | Upload a file to any doc |
| `print` | Download doc as PDF via print format |
| `bulk` | Patch or delete many docs matching a filter |

---

## Token Efficiency Flags

Built for agent pipelines where every byte costs tokens:

| Flag | Effect | Measured reduction |
|------|--------|-------------------|
| `--sparse` | Strip null, empty, and zero-valued non-semantic fields | ~55% on list queries |
| `--strip-meta` | Remove Frappe system fields (`owner`, `creation`, `utm_*`, etc.) | ~20 fields per doc |

Both flags work on `get`, `search`, `create`, `patch`, `apply`, `link`. Combine them:

```bash
frappe-ctl next get SalesOrder --sparse --strip-meta
```

`describe` flags for schema context reduction:

| Flag | Effect | Measured reduction |
|------|--------|-------------------|
| `--compact` | fieldname/type/label only, options only for Link types | 94% (239KB → 14.8KB) |
| `--required` | Required fields only (`reqd: 1`) | varies (239KB → 31KB) |
| `--names-only` | Field name list only | 99% (239KB → 2.3KB) |
| `--relationships` | Link/Table fields only — entity relationship map | 5.4KB |

---

## Examples

```bash
# List + fetch
frappe-ctl next get Customer
frappe-ctl next get SalesOrder --filter "status=Open" --limit 50
frappe-ctl next get SalesOrder --filter "status!=Cancelled" --filter "company=Acme"
frappe-ctl next get SalesOrder SO-2024-0001
frappe-ctl next get SalesOrder --sparse                          # strip nulls — 55% fewer tokens
frappe-ctl next get SalesOrder --sparse --strip-meta            # strip nulls + system fields

# Count (single integer — no doc fetch)
frappe-ctl next count "Sales Order"
frappe-ctl next count "Sales Order" --filter "status=Open"

# Search (text match by title field)
frappe-ctl next search Project "V Builders"
frappe-ctl next search Customer "magic peacock" --field customer_name
frappe-ctl next search "Sales Order" "SAL-ORD" --field name

# Schema
frappe-ctl next describe SalesOrder                              # full schema
frappe-ctl next describe SalesOrder --required                  # required fields only
frappe-ctl next describe SalesOrder --compact                   # trimmed — 94% smaller
frappe-ctl next describe SalesOrder --names-only                # field list only — 99% smaller
frappe-ctl next describe SalesOrder --relationships             # Link/Table fields + targets

# Follow a Link field (3 calls collapsed into 1 command)
frappe-ctl next link "Sales Order" SO-001 project               # → returns Project doc
frappe-ctl next link "Sales Order" SO-001 customer --sparse

# Pre-flight and diff (read-only)
frappe-ctl next validate "Purchase Order" --data '{"supplier":"Acme"}'   # → MISSING: ...
frappe-ctl next diff Project PROJ-001 --data '{"status":"Completed"}'    # → shows delta

# Apply from file (create if no name, update if name present)
frappe-ctl next apply --file customer.json
frappe-ctl next apply --file so.json --dry-run
echo '{"doctype":"Customer","customer_name":"Acme"}' | frappe-ctl next apply --file -

# Write (inline data)
frappe-ctl next create Customer --data '{"customer_name":"Acme","customer_type":"Company"}'
frappe-ctl next patch SalesOrder SO-001 --data '{"status":"On Hold"}'
frappe-ctl next delete SalesOrder SO-001 --force

# Lifecycle
frappe-ctl next submit SalesOrder SO-001
frappe-ctl next cancel SalesOrder SO-001

# Workflow (ERPNext approval flows)
frappe-ctl next workflow "Sales Order" SO-001 --action "Approve"
frappe-ctl next workflow "Leave Application" LA-001 --action "Reject"

# File operations
frappe-ctl next attach "Sales Invoice" SINV-001 --file invoice.pdf
frappe-ctl next attach "Sales Invoice" SINV-001 --file contract.pdf --private
frappe-ctl next print "Sales Invoice" SINV-001 --output sinv-001.pdf
frappe-ctl next print "Sales Invoice" SINV-001 --format "GST Tax Invoice" --output sinv-001.pdf

# Methods + reports
frappe-ctl frappe call frappe.client.get_count --data '{"doctype":"User"}'
frappe-ctl next report "Accounts Receivable" --filter '{"company":"Acme"}'
frappe-ctl next report "Project Billing Summary" --sparse       # keyed objects, nulls stripped

# Bulk ops (paginated — works across thousands of docs)
frappe-ctl next bulk patch SalesOrder --filter "status=Draft" --data '{"status":"Cancelled"}' --dry-run
frappe-ctl next bulk patch SalesOrder --filter "status=Draft" --data '{"status":"Cancelled"}'
frappe-ctl next bulk delete SalesOrder --filter "status=Cancelled" --force
# → { "total": 12, "success": 11, "failed": 1, "errors": [...] }

# Frappe Cloud OAuth (PKCE — opens browser)
frappe-ctl auth login --client-id <oauth_client_id>          # first time
frappe-ctl auth login --site prod --client-id <id>           # specific profile
frappe-ctl auth status                                        # check token expiry
frappe-ctl auth logout                                        # revoke + delete token

# Ops + discovery
frappe-ctl next logs --limit 20
frappe-ctl next logs --since 2026-06-10                          # entries from date forward
frappe-ctl next logs --since 2026-06-10 --compact               # no tracebacks — ~3KB saved/entry
frappe-ctl next logs --method submit
frappe-ctl next logs --exclude-method raven,sync_invalid_tokens  # suppress scheduler noise
frappe-ctl next logs --no-default-exclude                        # show everything
frappe-ctl next resources
frappe-ctl next resources --compact                              # name list only
frappe-ctl next resources --compact --submittable               # submittable DocTypes only
frappe-ctl hr resources -o table

# Agent context
frappe-ctl agent-context                                        # static CLI schema
frappe-ctl next agent-context --doctypes "Project,Sales Order,Purchase Order" --compact --include-counts
FRAPPE_CTL_READONLY=1 frappe-ctl next get Customer             # safe read-only mode

# Output formats
frappe-ctl next get Customer -o json   # default when piped
frappe-ctl next get Customer -o table  # default in TTY
frappe-ctl next get Customer -o csv
```

---

## Output

- **TTY** → table by default
- **Pipe / non-TTY** → JSON by default
- **Running under a known AI agent** (Claude Code, Cursor, Codex, and 20+ others) → JSON by default, even in a TTY — some agent harnesses attach a pty, so a real terminal check alone isn't reliable. Detected via env vars, no config needed.
- Override with `-o json|table|csv`

```bash
# Pipe into jq
frappe-ctl next get SalesOrder --filter "status=Open" | jq '.[].name'

# Token-efficient agent pipeline
frappe-ctl next get SalesOrder --sparse --strip-meta | jq '.'
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error — bad input, HTTP failure, validation failure |
| `4` | Auth required — no profile configured, named profile not found, or HTTP 401. **Not** raised for HTTP 403 (Frappe also returns 403 for plain permission errors on a valid session — re-auth wouldn't fix that) |

---

## Multi-site

```bash
frappe-ctl profile add uat --url http://localhost:8080 --key k --secret s
frappe-ctl profile add prod --url https://live.erpnext.com --key k2 --secret s2
frappe-ctl profile use prod

# Override per-command
frappe-ctl --site uat next get Customer
```

App version pinning (for when sites run different versions):
```bash
frappe-ctl profile add uat --url http://localhost:8080 --key k --secret s \
  --app-version next=v16 --app-version hr=v16
```

---

## Tests

```bash
bun test
```

201 tests, colocated with source (`*.test.ts`). Pattern: BDD spec → TDD (`*.test.ts`) → implementation. HTTP layer mocked via `spyOn(globalThis, "fetch")` — no live server needed.

---

## Project Layout

```
src/
  cli.ts              Entry point + arg parser
  client.ts           Frappe REST client (auth, all HTTP methods)
  config.ts           Profile management
  apps.ts             App registry (aliases, modules, versions, KEY_FIELDS)
  output.ts           Table / CSV / sparse formatters + output filter utilities
  commands/           One file per verb (get, describe, create, ...)
  __fixtures__/       Shared mock API responses for tests
docs/
  adr/                Architecture Decision Records — why, not what
    0000-template.md
    YYYYMMDD-NNN-title.md   (one file per decision, dated)
```

---

## Architecture Decisions (ADRs)

Design choices live in `docs/adr/`. Each file documents one decision: what was chosen, why, and the tradeoffs.

```bash
# List all accepted decisions
grep -rl "status: accepted" docs/adr/

# Find decisions about auth
grep -rl "tags:.*auth" docs/adr/

# See every Frappe quirk we hit
grep -rl "frappe-quirk" docs/adr/
```

Current decisions: [001 auth header](docs/adr/20260610-001-auth-header-format.md) · [002 kubectl grammar](docs/adr/20260610-002-kubectl-grammar.md) · [003 zero deps](docs/adr/20260610-003-zero-dependencies.md) · [004 config functions](docs/adr/20260610-004-config-functions-not-constants.md) · [005 listDocTypes POST](docs/adr/20260610-005-listdoctypes-post-not-get.md) · [006 in filter](docs/adr/20260610-006-in-filter-comma-string.md) · [007 delete --force](docs/adr/20260610-007-delete-requires-force.md) · [008 TTY output](docs/adr/20260610-008-tty-output-detection.md) · [009 OAuth PKCE](docs/adr/20260610-009-oauth-pkce-explicit-client-id.md) · [010 bench out of scope](docs/adr/20260610-010-bench-out-of-scope.md) · [011 fixed OAuth port](docs/adr/20260610-011-fixed-oauth-redirect-port.md) · [012 arrayBuffer not text](docs/adr/20260610-012-arraybuffer-not-text.md) · [013 stdout drain](docs/adr/20260610-013-stdout-drain-before-exit.md) · [014 sparse/strip-meta](docs/adr/20260610-014-sparse-and-strip-meta-output-filters.md) · [015 new read verbs](docs/adr/20260610-015-count-search-link-validate-diff-verbs.md) · [016 MCP stdio](docs/adr/20260611-016-mcp-stdio-adapter.md) · [017 validate --output json](docs/adr/20260611-017-validate-output-json.md) · [018 --enable-verbs](docs/adr/20260611-018-enable-verbs-allowlist.md) · [019 --wait async jobs](docs/adr/20260611-019-wait-on-async-jobs.md) · [020 credential leak boundary](docs/adr/20260703-020-credential-leak-boundary.md) · [021 skills install verb](docs/adr/20260703-021-skills-install-verb.md) · [022 exit code 4 auth required](docs/adr/20260703-022-exit-code-4-auth-required.md) · [023 agent env-var detection](docs/adr/20260703-023-agent-env-var-detection.md) · [024 --debug flag](docs/adr/20260703-024-debug-flag.md) · [025 skill file freshness check](docs/adr/20260703-025-skill-file-freshness-check.md) · [026 bin wrapper symlink resolution](docs/adr/20260703-026-bin-wrapper-symlink-resolution.md) · [027 skills.sh discovery](docs/adr/20260704-027-skills-sh-discovery.md)

---

## AI Agent Quick Setup

`frappe-ctl.skill.md` ships with the package — drop it into your AI assistant and it instantly knows how to use the CLI efficiently.

Fastest path — `frappe-ctl skills install` copies it into every AI agent dir it detects in your project (`.claude/skills/`, `.cursor/skills/`, `.codex/skills/`, and 13 more), plus a common `.agents/skills/` path. Run `frappe-ctl skills install --all` to install for every supported agent regardless of detection, or `--global` to install into your home directory instead of the current project.

Also listed on the community [skills.sh](https://skills.sh) directory — install with their CLI from any project, no frappe-ctl install required first:
```bash
npx skills add MalharDotTech/frappe-ctl
```

| Platform | How to load |
|----------|------------|
| **Claude Code** | Add `@frappe-ctl.skill.md` to your project `CLAUDE.md`, or copy to `.claude/commands/` |
| **Cursor** | Already in `.cursor/rules/frappe-ctl.mdc` — auto-loads |
| **OpenAI Codex CLI** | Included in `AGENTS.md` at project root — auto-loads |
| **ChatGPT / Perplexity** | Paste contents of `frappe-ctl.skill.md` into custom instructions |
| **Claude Desktop (MCP)** | See MCP setup below |

After `bun add -g frappe-ctl`, find the skill file at:
```
$(bun pm ls -g | grep frappe-ctl)/frappe-ctl.skill.md
```

---

## Agent Integration

frappe-ctl is built to plug directly into agent frameworks — Claude Code, Cursor, Codex, and any tool that can shell out.

Key design choices that make it agent-friendly:
- **JSON stdout by default** when not a TTY — pipe straight into `jq` or an LLM
- **`--sparse` / `--strip-meta`** — strip null and system fields; measured 55% token reduction on lists
- **Token-efficient schema modes** — `describe --required` (8 fields vs 170), `describe --compact` (94% smaller), `--names-only` (99% smaller)
- **`count` verb** — cardinality without fetching docs
- **`search` verb** — text lookup without fetch-all-filter-locally
- **`link` verb** — follow foreign key in one command vs two round-trips
- **`validate` verb** — pre-flight required field check before any write attempt
- **`diff` verb** — show what a patch would change before committing
- **`agent-context --doctypes --compact --include-counts`** — compact per-session startup context with live counts
- **Errors enumerate valid options** — agent can self-correct in one retry
- **`--force` required for destructive ops** — agents can't accidentally delete
- **Named profiles + `FRAPPE_CTL_CONFIG_DIR`** — sandboxed config per agent session

### Agent startup pattern

```bash
# One call at session start — compact schema for 3 DocTypes + live counts
frappe-ctl next agent-context \
  --doctypes "Project,Sales Order,Purchase Order" \
  --compact \
  --include-counts
# → < 4KB JSON with required_fields, key_fields, record_count per DocType
```

### MCP server

`frappe-ctl mcp` starts a JSON-RPC 2.0 stdio server consumable by Claude, Cursor, and any MCP-compatible host.

```bash
frappe-ctl mcp                     # read-only (5 tools)
frappe-ctl mcp --allow-mutations   # adds create/patch/delete (8 tools total)
frappe-ctl mcp --site prod         # use specific profile
```

| Tool | What it does |
|------|-------------|
| `frappe_get` | Single doc or list with filters + sparse |
| `frappe_count` | Count matching docs — plain integer |
| `frappe_search` | Text search by title field |
| `frappe_describe` | DocType schema (supports `required`, `relationships`) |
| `frappe_validate` | Pre-flight check — returns `{valid, missing, unknown}` |
| `frappe_create` | Create doc (`--allow-mutations` only) |
| `frappe_patch` | Update fields (`--allow-mutations` only) |
| `frappe_delete` | Delete doc, requires `force:true` (`--allow-mutations` only) |

---

## ERPNext Coverage

| Verb | ERPNext use case |
|------|-----------------|
| `get` | Fetch Sales Orders, Invoices, Customers, Projects |
| `count` | How many open SOs, unpaid invoices, active projects |
| `search` | Find project by name fragment, customer by partial match |
| `describe` | Inspect any DocType schema before writing; relationship map |
| `link` | Fetch SO → its Project in one command |
| `validate` | Pre-flight any create/patch payload against required fields |
| `diff` | Preview field changes before patching |
| `apply` | Create or update doc from JSON file — agent-friendly batch ops |
| `create` | New Customer, Supplier, Sales Order, Project |
| `patch` | Update status, amounts, custom fields |
| `delete` | Remove draft docs (`--force` required) |
| `submit` | Submit Sales Order, Purchase Invoice, Payment Entry |
| `cancel` | Cancel submitted docs |
| `workflow` | Trigger approval flows — approve/reject Leave, Expense, PO, etc. |
| `call` | Any whitelisted method — `frappe.client.get_count`, custom scripts |
| `report` | Run Accounts Receivable, Project Billing Summary, etc. |
| `resources` | Discover all DocTypes in app modules |
| `logs` | Tail Frappe Error Log — ops debugging |
| `attach` | Upload files to Sales Invoices, Projects, Purchase Orders |
| `print` | Download Sales Invoice / SO as PDF via any print format |
| `bulk` | Patch or delete many docs matching a filter in one command |

---

## Roadmap

Live, actively maintained planning lives in **[ROADMAP.md](ROADMAP.md)** — bucketed by impact (Functional/Security/Distribution/Onboarding/etc), not phase number. The Phase 1/2 history below is accurate and kept for the record; Phase 3 items not yet done are also tracked in ROADMAP.md's Distribution bucket going forward.

### Phase 1 — ERPNext complete ✅

- [x] Core verbs: `get`, `describe`, `create`, `patch`, `delete`, `submit`, `cancel`, `call`, `report`, `resources`
- [x] `apply` — file-based create/update, stdin support
- [x] `workflow` — ERPNext workflow action transitions
- [x] `attach` — multipart file upload to any doc
- [x] `print` — binary PDF download, pipe or save to file
- [x] `logs` — Frappe Error Log tail with method filter, `--since`, `--compact`
- [x] `--dry-run` on all mutations
- [x] `FRAPPE_CTL_READONLY=1` — hard-block mutations for read-only agent sessions
- [x] `agent-context` — versioned JSON schema for LLM tool discovery + DocType-scoped compact mode
- [x] `bulk` — filter-scoped patch/delete, paginated (`listAll`), partial-failure tolerant
- [x] Error enumeration — unknown verb lists all valid verbs
- [x] Frappe Cloud auth — OAuth PKCE for `*.erpnext.com` and `*.frappe.cloud`
- [x] `count` — cardinality without fetching docs
- [x] `search` — text lookup by title field, auto-detects `title_field` from DocType meta
- [x] `link` — follow Link field, return linked doc in one command
- [x] `validate` — pre-flight required field check with Levenshtein typo suggestions
- [x] `diff` — read-only delta preview before patching
- [x] `--sparse` / `--strip-meta` — token reduction output filters (55% measured)
- [x] `describe --required / --compact / --names-only / --relationships` — schema modes (94–99% smaller)
- [x] `resources --compact / --submittable` — DocType list modes
- [x] `KEY_FIELDS` registry in `apps.ts` — key fields per DocType for agent context

### Phase 2 — Agent-native hardening ✅

- [x] MCP stdio server — 5 read-only tools + 3 mutation tools behind `--allow-mutations`
- [x] `call --wait` — block until Frappe background job completes (`frappe.utils.background_jobs.get_info`)
- [x] `--enable-verbs get,describe` — hard surface-area limit for sandboxed agent invocations
- [x] `validate --output json` — structured `{valid, required, missing, unknown}` on stdout for agent branching

### Phase 3 — Distribution

- [ ] Shell completions (bash/zsh/fish)
- [ ] Compiled binary releases via GitHub Actions (`bun build --compile`)
- [ ] `--wait-timeout <seconds>` — configurable timeout for heavy async jobs
- [ ] `jobs` verb — list/cancel Frappe background jobs
- [ ] Homebrew tap
