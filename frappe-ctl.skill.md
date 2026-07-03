# frappe-ctl — Operator Skill

CLI for Frappe/ERPNext. Grammar: `frappe-ctl [--site <profile>] <app> <verb> <DocType> [name] [flags]`

App aliases: `next`=ERPNext, `hr`=HRMS, `crm`=CRM, `hd`=Helpdesk, `frappe`=core.

---

## Session Startup

Always run first — compact schema + live counts:

```bash
frappe-ctl next agent-context \
  --doctypes "Project,Sales Order,Purchase Order,Customer" \
  --compact --include-counts
```

---

## Verb Reference

| Verb | What |
|------|------|
| `get` | List docs or fetch one by name. Default limit 20. |
| `count` | Integer count matching filter — never fetch to count. |
| `search` | Text search by title field. Use over `get --filter` for fuzzy. |
| `describe` | DocType schema. Use `--required` before create (8 fields not 170). |
| `link` | Follow Link field → linked doc in 1 call (not 2 `get` calls). |
| `validate` | Pre-flight required fields. Exit 0 = safe to write. |
| `diff` | Show what a patch would change. Read-only. |
| `create` | New doc from `--data` JSON. |
| `patch` | Update fields. |
| `delete` | Requires `--force`. |
| `apply` | Create/update from JSON file or stdin. |
| `submit` | docstatus 0 → 1. |
| `cancel` | docstatus 1 → 2. |
| `workflow` | Apply workflow action (approve/reject). |
| `call` | Any whitelisted Frappe method. `--wait` for async jobs. |
| `bulk` | Patch/delete many docs matching filter. Always `--dry-run` first. |
| `report` | Run saved Frappe Report. |
| `attach` | Upload file to a doc. |
| `print` | Download doc as PDF. |
| `logs` | Tail Frappe Error Log. |
| `resources` | List all DocTypes for app. |
| `agent-context` | Compact session startup schema. |

---

## Token Efficiency

| Flag | Effect | Reduction |
|------|--------|-----------|
| `--sparse` | Strip null/empty/zero fields | ~55% on lists |
| `--strip-meta` | Remove system fields (owner, creation, utm_*) | ~20 fields/doc |
| `describe --compact` | fieldname/type/label only | 94% |
| `describe --required` | Required fields only | varies |
| `describe --names-only` | Field list only | 99% |
| `describe --relationships` | Link/Table fields only | 5.4KB |

Always use `--sparse` when fetching for context, not display.

---

## Before Writing

```bash
# 1. Check required fields first
frappe-ctl next describe "Purchase Order" --required

# 2. Validate payload — structured output for branching
frappe-ctl next validate "Purchase Order" \
  --data '{"supplier":"Acme","items":[...]}' --output json
# exit 0 → proceed; exit 1 + stdout {valid:false,missing:[...]} → fix payload

# 3. Preview patch delta
frappe-ctl next diff Project PROJ-001 --data '{"status":"Completed"}'

# 4. Dry-run bulk before committing
frappe-ctl next bulk patch "Sales Order" \
  --filter "status=Draft" --data '{"status":"Cancelled"}' --dry-run
```

---

## Safety Rules

- `count` before `delete` — know scope first
- Never `bulk delete` without `--dry-run` — always
- Never patch `status`/`docstatus` directly on submittable docs — use `submit`/`cancel`/`workflow`
- `FRAPPE_CTL_READONLY=1` — hard-blocks all mutations, set for read-only sessions
- `--enable-verbs get,count,search,describe` — sandboxes verb set

---

## Output Parsing

| Command | Stdout | On failure |
|---------|--------|------------|
| `count` | plain integer | — |
| `get`, `search` | JSON array (piped) / table (TTY) | stderr |
| `validate` (default) | empty | MISSING/UNKNOWN on stderr, exit 1 |
| `validate --output json` | `{valid,required,missing,unknown}` | exit 1, stdout NOT empty |
| `bulk` | `{total,success,failed,errors[]}` | stdout always |
| `call --wait` | job result JSON | exit 1 if job failed |

Errors → stderr. Data → stdout. Never mixed.

**Exit codes** — branch on these instead of parsing stderr text:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error — bad input, HTTP failure, validation failure |
| `4` | Auth required — no profile, named profile not found, or HTTP 401. **Not** raised for 403 (Frappe uses 403 for plain permission errors too — re-auth won't fix those) |

You already get JSON by default — no `--output json` needed. Running as an agent (Claude Code, Cursor, Codex, and others) is auto-detected via env vars, so output is JSON even if a pty makes the process look like a TTY. Use `--debug` if a command behaves unexpectedly across profiles — prints resolved profile + auth source to stderr, never the credential value.

---

## Common Patterns

```bash
# Find then fetch
frappe-ctl next search Project "V Builders" --sparse
frappe-ctl next count "Sales Order" --filter "project=PROJ-0005"

# Follow foreign key (1 call not 2)
frappe-ctl next link "Sales Order" SAL-ORD-001 project --sparse

# Async job (blocks until done)
frappe-ctl next call erpnext.stock.utils.make_stock_entry --data '{...}' --wait

# Multi-site
frappe-ctl --site prod next get Customer --sparse
frappe-ctl --site uat next get Customer --sparse
```

---

## MCP Setup (Claude Desktop / Cursor / VS Code)

```json
{
  "mcpServers": {
    "frappe": {
      "command": "frappe-ctl",
      "args": ["mcp"],
      "env": {}
    }
  }
}
```

Add `"--allow-mutations"` to `args` for write access. Add `"FRAPPE_CTL_READONLY": "1"` to `env` for read-only.

MCP tools: `frappe_get`, `frappe_count`, `frappe_search`, `frappe_describe`, `frappe_validate` (always). `frappe_create`, `frappe_patch`, `frappe_delete` (mutations only).

---

## Auth

Self-hosted: `Authorization: token <api_key>:<api_secret>`
Frappe Cloud: OAuth PKCE — `frappe-ctl auth login --client-id <id>`

```bash
frappe-ctl profile add prod \
  --url https://yoursite.erpnext.com \
  --key <api_key> --secret <api_secret>
frappe-ctl profile use prod
```

Full quickstart: https://ctl.malhar.tech/quickstart
