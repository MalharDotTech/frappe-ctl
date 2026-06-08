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
- **Agent-native** — JSON stdout by default when not a TTY, pipe-safe
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

| Verb | What |
|------|------|
| `get` | List docs or fetch one by name |
| `describe` | Show DocType schema and field types |
| `create` | Create a new doc |
| `patch` | Update fields on an existing doc |
| `delete` | Delete a doc (requires `--force`) |
| `submit` | Submit a doc (docstatus 0 → 1) |
| `cancel` | Cancel a submitted doc (docstatus 1 → 2) |
| `call` | Call any whitelisted Frappe method |
| `report` | Run a saved Frappe Report |
| `resources` | List all DocTypes for an app |

---

## Examples

```bash
# List
frappe-ctl next get Customer
frappe-ctl next get SalesOrder --filter "status=Open" --limit 50
frappe-ctl next get SalesOrder --filter "status!=Cancelled" --filter "company=Acme"

# Fetch one
frappe-ctl next get SalesOrder SO-2024-0001

# Schema
frappe-ctl next describe SalesOrder

# Write
frappe-ctl next create Customer --data '{"customer_name":"Acme","customer_type":"Company"}'
frappe-ctl next patch SalesOrder SO-001 --data '{"status":"On Hold"}'
frappe-ctl next delete SalesOrder SO-001 --force

# Lifecycle
frappe-ctl next submit SalesOrder SO-001
frappe-ctl next cancel SalesOrder SO-001

# Methods
frappe-ctl frappe call frappe.client.get_count --data '{"doctype":"User"}'

# Reports
frappe-ctl next report "Accounts Receivable" --filter '{"company":"Acme"}'

# Discover what DocTypes an app exposes
frappe-ctl next resources
frappe-ctl hr resources -o table

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

90 tests, colocated with source (`*.test.ts`). Pattern: BDD spec (`frappe-ctl.md`) → TDD (`*.test.ts`) → implementation. HTTP layer mocked via `spyOn(globalThis, "fetch")` — no live server needed.

---

## Project Layout

```
src/
  cli.ts              Entry point + arg parser
  client.ts           Frappe REST client (auth, all HTTP methods)
  config.ts           Profile management
  apps.ts             App registry (aliases, modules, versions)
  output.ts           Table / CSV formatters
  commands/           One file per verb (get, describe, create, ...)
  __fixtures__/       Shared mock API responses for tests
```

---

## Agent Integration

frappe-ctl is built to plug directly into agent frameworks — Claude Code, Cursor, Codex, openclaw, and any tool that can shell out.

Key design choices that make it agent-friendly:
- **JSON stdout by default** when not a TTY — pipe straight into `jq` or an LLM
- **Errors enumerate valid options** — agent can self-correct in one retry, no help-text parsing
- **`--force` required for destructive ops** — agents can't accidentally delete
- **Named profiles** — agents reuse a profile without re-specifying credentials every call
- **`FRAPPE_CTL_CONFIG_DIR`** env var — sandboxed config per agent session if needed

### MCP (coming)
An MCP adapter will wrap `client.ts` as a stdio MCP server, exposing typed tools (`get_doc`, `list_docs`, `create_doc`, etc.) consumable directly by Claude, Cursor, and any MCP-compatible host. Read-only by default; mutations require explicit opt-in.

---

## ERPNext Coverage (current)

| Verb | ERPNext use case |
|------|-----------------|
| `get` | Fetch Sales Orders, Invoices, Customers, Projects |
| `describe` | Inspect any DocType schema before writing |
| `create` | New Customer, Supplier, Sales Order, Project |
| `patch` | Update status, amounts, custom fields |
| `delete` | Remove draft docs (--force required) |
| `submit` | Submit Sales Order, Purchase Invoice, Payment Entry |
| `cancel` | Cancel submitted docs |
| `call` | Any whitelisted method — `frappe.client.get_count`, custom scripts |
| `report` | Run Accounts Receivable, Project Billing Summary, etc. |
| `resources` | Discover all DocTypes in an app's modules |

### ERPNext "done done" checklist (before moving to other apps)

- [ ] `workflow` verb — trigger ERPNext workflow actions (approve/reject)
- [ ] `attach` verb — upload file to a doc (`/api/method/upload_file`)
- [ ] `print` verb — fetch print format as PDF (`/api/method/frappe.utils.print_format.download_pdf`)
- [ ] `bulk` flag — `get` + patch/delete across a filtered set in one command
- [ ] `--dry-run` on create/patch/delete — show what would happen, no write
- [ ] Frappe Cloud auth — OAuth PKCE flow + token storage for `*.erpnext.com` sites
- [ ] `agent-context` command — machine-readable JSON schema of all verbs/flags for LLM tool registration

---

## Roadmap

### Phase 1 — ERPNext complete (before next app)
- [ ] `workflow` verb — approve/reject ERPNext workflow states
- [ ] `attach` / `print` verbs — file handling and PDF export
- [ ] `--dry-run` flag on all mutations
- [ ] Frappe Cloud auth (OAuth PKCE — `*.erpnext.com` and `*.frappe.cloud`)
- [ ] Error enumeration — invalid filter ops, bad DocType names list valid alternatives
- [ ] `agent-context` command — versioned JSON schema for LLM tool discovery

### Phase 2 — Agent-native hardening
- [ ] MCP adapter — `mcp/index.ts` stdio server wrapping `client.ts`, read-only by default
- [ ] `--wait` flag on mutations — block until Frappe background job completes
- [ ] `jobs` command — list/get/cancel Frappe background jobs (`frappe.model.delete_doc`)
- [ ] Command allowlisting — `--enable-verbs get,describe` for sandboxed agent sessions
- [ ] `FRAPPE_CTL_READONLY=1` env var — hard block on all mutations

### Phase 3 — Distribution
- [ ] Shell completions (bash/zsh/fish)
- [ ] Compiled binary releases via GitHub Actions (`bun build --compile`)
- [ ] `frappe-ctl next watch` — poll and stream doc changes
- [ ] Homebrew tap
