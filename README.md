# frappe-ctl

`kubectl`-style CLI for the Frappe ecosystem. One tool for every app built on Frappe — ERPNext, HRMS, CRM, Helpdesk, and more.

```
frappe-ctl [--site <profile>] <app> <verb> <DocType> [name] [flags]
```

The `app` alias scopes every command to the right module namespace. Humans and agents both get deterministic, token-efficient commands.

---

## Why

Frappe's REST API is powerful but raw. Every integration ends up reimplementing auth, filter syntax, output formatting, and profile management. `frappe-ctl` solves that once — then gets out of the way.

Design goals:
- **Agent-native** — JSON stdout by default when not a TTY, pipe-safe, token-efficient
- **Deterministic grammar** — `app verb DocType [name]`, inspired by `kubectl`
- **No dependencies** — pure Bun/TypeScript, no Axios, no CLI frameworks
- **Multi-site** — named profiles, one config file, `--site` override anywhere

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
# Requires Bun
bun install

# Run directly
bun run src/cli.ts next get Customer

# Or compile a binary
bun build --compile --minify src/cli.ts --outfile frappe-ctl
./frappe-ctl next get Customer
```

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
- Override with `-o json|table|csv`

```bash
# Pipe into jq
frappe-ctl next get SalesOrder --filter "status=Open" | jq '.[].name'

# Token-efficient agent pipeline
frappe-ctl next get SalesOrder --sparse --strip-meta | jq '.'
```

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

Current decisions: [001 auth header](docs/adr/20260610-001-auth-header-format.md) · [002 kubectl grammar](docs/adr/20260610-002-kubectl-grammar.md) · [003 zero deps](docs/adr/20260610-003-zero-dependencies.md) · [004 config functions](docs/adr/20260610-004-config-functions-not-constants.md) · [005 listDocTypes POST](docs/adr/20260610-005-listdoctypes-post-not-get.md) · [006 in filter](docs/adr/20260610-006-in-filter-comma-string.md) · [007 delete --force](docs/adr/20260610-007-delete-requires-force.md) · [008 TTY output](docs/adr/20260610-008-tty-output-detection.md) · [009 OAuth PKCE](docs/adr/20260610-009-oauth-pkce-explicit-client-id.md) · [010 bench out of scope](docs/adr/20260610-010-bench-out-of-scope.md) · [011 fixed OAuth port](docs/adr/20260610-011-fixed-oauth-redirect-port.md) · [012 arrayBuffer not text](docs/adr/20260610-012-arraybuffer-not-text.md) · [013 stdout drain](docs/adr/20260610-013-stdout-drain-before-exit.md) · [014 sparse/strip-meta](docs/adr/20260610-014-sparse-and-strip-meta-output-filters.md) · [015 new read verbs](docs/adr/20260610-015-count-search-link-validate-diff-verbs.md)

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

### MCP (coming)
An MCP adapter will wrap `client.ts` as a stdio MCP server, exposing typed tools (`get_doc`, `list_docs`, `create_doc`, etc.) consumable directly by Claude, Cursor, and any MCP-compatible host. Read-only by default; mutations require explicit opt-in.

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

### Phase 2 — Agent-native hardening

- [ ] MCP adapter — `mcp/index.ts` stdio server wrapping `client.ts`, read-only by default
- [ ] `--wait` flag — block until Frappe background job completes
- [ ] `jobs` command — list/get/cancel Frappe background jobs
- [ ] Command allowlisting — `--enable-verbs get,describe` for sandboxed agent invocations
- [ ] `validate --output json` — structured `{"valid":false,"missing":[...]}` for agent pipelines

### Phase 3 — Distribution

- [ ] Shell completions (bash/zsh/fish)
- [ ] Compiled binary releases via GitHub Actions (`bun build --compile`)
- [ ] `frappe-ctl next watch` — poll and stream doc changes
- [ ] Homebrew tap
