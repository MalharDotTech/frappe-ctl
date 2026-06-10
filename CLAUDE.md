# frappe-ctl — Claude Dev Context

Read this before touching anything. These are the established conventions — don't drift from them.

**Version:** see `package.json → version` (single source of truth). Update there only — README, ADRs, and agent-context derive from it.

**Before making any non-trivial design choice:** check `docs/adr/` first. If a decision is already recorded, don't relitigate it. If you're making a new significant choice, create an ADR before or alongside the code change.

---

## What This Is

`kubectl`-style Bun/TypeScript CLI for the entire Frappe ecosystem. Not just ERPNext.

**Core grammar:**
```
frappe-ctl [--site <profile>] <app> <verb> <DocType> [name] [flags]
```

`app` alias (second token) scopes to the right app. `next` = ERPNext, `hr` = HRMS, etc. This is intentional — humans and agents both benefit from deterministic scoping.

**Design:** agent-native, pipe-safe JSON stdout, token-efficient output filters, no external deps, profile-based multi-site.

---

## Process: BDD → TDD → Code

1. **BDD** — update `frappe-ctl.md` (in vault, not this repo) with new behaviour in plain language
2. **TDD** — write `*.test.ts` first, make it fail, then implement
3. **Code** — implement until tests pass

Never add code without a test. Never add a test without it first failing.

---

## Auth — Critical

Frappe auth header is:
```
Authorization: token <api_key>:<api_secret>
```

**NOT** `Bearer`, **NOT** `Basic`. Every new transport layer must use this exact format. See `src/client.ts` constructor.

---

## Key Technical Decisions (don't relitigate these)

### Versioning: `vX` only
App versions are `v14`, `v15`, `v16` — major only. Minor/patch versions not tracked. Breaking changes only happen at major boundaries. `vX.Y` is rejected.

### Frappe filter `in` operator
The `in` filter takes a **comma-separated string**, not an array:
```typescript
["module", "in", "Accounts,Buying,Selling"]   // ✅
["module", "in", ["Accounts", "Buying"]]       // ❌ — server returns 417
```

### `listDocTypes` uses POST, not GET
`GET /api/resource/DocType` hits URL length limits with 10+ modules. Use `frappe.client.get_list` via POST. Also: `is_single` is not in Frappe's allowlist for this method — don't request it.

### Config functions, not constants
`configDir()` and `configFile()` are functions that read `FRAPPE_CTL_CONFIG_DIR` at call time. This lets tests inject a temp dir without module-level pollution. Never convert these back to constants.

### Output: pipe-safe
- TTY → table default
- Non-TTY / piped → JSON default
- Always check `process.stdout.isTTY` before defaulting output format

### `delete` requires `--force`
Never silently delete. If `force: false`, throw with message explaining the flag. This is intentional data-loss protection.

### `sparseDoc` KEEP_ZERO allowlist
`sparseDoc()` in `output.ts` strips zero values — but NOT for fields where zero is semantically meaningful (`docstatus`, `qty`, `grand_total`, `per_billed`, etc.). When adding new numeric fields that can legitimately be zero, add them to `KEEP_ZERO` in `output.ts`.

### `describe` filter flags apply before JSON output
`--required`, `--relationships`, `--compact`, `--names-only` all filter the `fields` array. The JSON output path uses `{ ...meta, fields }` to ensure filtered results — NOT raw `meta`. Never revert this to output raw `meta` for the catch-all JSON case, or `--required` silently returns all 170 fields.

### `search` 2-call pattern
When `--field` is not specified, `search` calls `getDocTypeMeta` first to determine `title_field`, then `searchDocs`. Use `--field` to collapse to 1 call when the field is known. Do not add caching for meta — calls are fast and caching adds complexity.

### `agent-context --doctypes` requires client; bare `agent-context` stays static
`frappe-ctl agent-context` (no app prefix) uses the early-return path — no profile, no client, outputs static CLI schema. `frappe-ctl next agent-context --doctypes ...` goes through the normal verb router and has a client. Keep these two paths separate. `--include-counts` must never silently degrade to zero counts when no client is available.

### `validate` uses `process.exit(1)`, not `die()`
`validate` exits 1 on missing/unknown fields because it's a validation result, not a fatal error. `die()` is reserved for CLI usage errors and infrastructure failures. Don't change this — operator agents use the exit code to branch without parsing stderr.

---

## File Layout

```
src/
  cli.ts              Entry + arg parser (no external deps)
  client.ts           All HTTP — getDoc, listDocs, countDocs, searchDocs, callMethod, uploadFile, downloadPdf
  config.ts           Profile CRUD — functions not constants
  apps.ts             App registry — alias, modules, supportedVersions, KEY_FIELDS
  output.ts           Table / CSV / sparse formatters — sparseDoc, stripMetaDoc, applyOutputFilters
  commands/
    auth.ts           OAuth login/logout/status (PKCE flow)
    get.ts            list + single fetch (--sparse, --strip-meta)
    count.ts          count docs matching filter — plain integer output
    search.ts         text search by title_field (auto-detect from meta or --field)
    describe.ts       DocType schema (--required, --compact, --names-only, --relationships)
    link.ts           follow Link field, return linked doc
    validate.ts       pre-flight required field check — Levenshtein typo suggestions, exit 1 on fail
    diff.ts           show field delta before patching (read-only)
    apply.ts          create/update from JSON file or stdin (--sparse, --strip-meta)
    write.ts          create, patch, delete (--sparse, --strip-meta on create/patch)
    lifecycle.ts      submit, cancel
    workflow.ts       ERPNext workflow action transitions
    attach.ts         multipart file upload
    print.ts          binary PDF download
    logs.ts           Frappe Error Log tail (--since, --compact)
    bulk.ts           filter-scoped patch/delete with listAll pagination
    call.ts           raw whitelisted method call
    report.ts         saved Report runner (--sparse)
    resources.ts      DocType lister per app (--compact, --submittable)
    agent-context.ts  static CLI schema + DocType-scoped compact schema (--doctypes, --include-counts)
  oauth.ts            PKCE helpers: verifier, challenge, exchange, refresh, revoke
  token-store.ts      Token persistence: macOS Keychain + file fallback (tokens.json 0o600)
  __fixtures__/       Shared mock responses — update when adding fields
```

Each command file exports one `cmd*` function. Keep commands thin — they call `client.*` and format output, nothing else.

---

## Testing Conventions

```bash
bun test          # run all
bun test src/commands/get.test.ts   # single file
```

- Tests colocated with source (`commands/get.ts` → `commands/get.test.ts`)
- Mock HTTP: `spyOn(globalThis, "fetch").mockResolvedValueOnce(...)`
- **Never re-spy on fetch inside a test to count calls** — use the spy returned from the initial `spyOn(...)` call. Re-spying creates a fresh spy that reports stale call counts from the underlying mock.
- Config isolation: set `process.env.FRAPPE_CTL_CONFIG_DIR` to a temp dir in `beforeEach`, restore in `afterEach`
- Fixtures in `src/__fixtures__/api-responses.ts` — add shapes there, not inline in tests
- Fixture format for `callMethod` responses: `{ message: <payload> }` (not `{ data: ... }`)
- Fixture format for `listDocs` / `getDoc` responses: `{ data: <payload> }`
- For verbs that make multiple sequential HTTP calls (e.g. `link`: getDoc + getDocTypeMeta + getDoc), chain `mockResolvedValueOnce` on the same spy — do not call `spyOn` multiple times

Target: every new verb gets its own `*.test.ts` with at minimum: happy path, filter/flag behaviour, output format (table + json).

---

## Adding a New Verb

1. Create `src/commands/<verb>.ts` — export `cmd<Verb>(client, args)`
2. Create `src/commands/<verb>.test.ts` — write tests first
3. Add fixture shapes to `src/__fixtures__/api-responses.ts`
4. Wire into `cli.ts` verb router (`switch (args.verb)`)
5. Add to `usage()` string in `cli.ts`
6. Add to `VERBS` array in `src/commands/agent-context.ts`
7. Update `CLAUDE.md` file layout and any relevant sections
8. If the verb introduces a non-obvious design choice → create `docs/adr/YYYYMMDD-NNN-title.md`

If the verb returns a doc or doc list, accept `sparse?: boolean` and `stripMeta?: boolean` in its args and pass `{ sparse, stripMeta }` to `printDoc` / `printDocs`. Wire from `cli.ts` using the top-level `sparse` and `stripMeta` variables already extracted there.

## Adding an ADR

When to write one: non-trivial design choice, Frappe quirk with surprising behaviour, rejected alternative worth recording, security constraint.

File: `docs/adr/YYYYMMDD-NNN-kebab-title.md`
- `YYYYMMDD` = date of decision (today's date)
- `NNN` = next sequential number (check existing files)
- Filename is the primary search surface — make it descriptive

Required frontmatter (grepp-able fields):
```yaml
---
adr: "NNN"
title: ""
date: YYYY-MM-DD
status: accepted          # proposed | accepted | deprecated | superseded-by:NNN
frappe_version: "v16"
frappe_ctl_version: "0.1.0"   # match package.json at time of decision
tags: []                  # e.g. [auth, http, frappe-quirk, safety]
---
```

Body sections: `## Decision` (1 sentence) · `## Context` (why forced) · `## Consequences` (✅ pros, ⚠️ tradeoffs).

Grep patterns:
```bash
grep -rl "status: accepted" docs/adr/       # all accepted
grep -rl "tags:.*auth" docs/adr/            # auth decisions
grep -rl "frappe-quirk" docs/adr/           # Frappe-specific gotchas
grep -rl "superseded-by" docs/adr/          # deprecated choices
```

## Adding a New App

1. Add entry to `APPS` in `src/apps.ts` — alias, name, description, supportedVersions, currentStable, modules
2. `modules` must be exact Frappe module names (used as filter values — case-sensitive)
3. Add key fields for common DocTypes to `KEY_FIELDS` in `src/apps.ts` — used by `agent-context --compact`
4. Add test to `apps.test.ts` verifying the new app passes invariants

---

## Style Rules

- No comments unless the WHY is non-obvious (hidden constraint, Frappe quirk, known bug workaround)
- No error handling for things that can't happen — trust internal guarantees
- No abstractions beyond what the current task needs
- Short variable names are fine; precise names are better than long names
- `die(msg)` for all fatal CLI errors — it logs to stderr and exits 1
- Never `process.exit` anywhere except `die()`, `validate.ts` (exit 1 on validation failure), and `main().catch`

---

## Agent-Native Design Principles (don't compromise these)

Drawn from gogcli, Trevin's 10 principles, and openclaw integration requirements. These inform every new feature decision.

### Locked in (already implemented)
| Principle | How frappe-ctl does it |
|-----------|----------------------|
| Non-interactive by default | No prompts. `--force` for destructive ops. |
| JSON stdout when piped | `process.stdout.isTTY` check on every command |
| Errors to stderr, data to stdout | `die()` uses `console.error`, data uses `console.log` / `process.stdout.write` |
| Exit codes | 0 = success, 1 = any error or validation failure |
| Named profiles | `profile add/use/list/remove` + `--site` override |
| `FRAPPE_CTL_CONFIG_DIR` | Sandboxed config per agent session |
| Bounded responses | Default `--limit 20` on `get` and `search` |
| Token efficiency | `--sparse` strips null/empty/zero (~55% reduction); `--strip-meta` removes system fields |
| Pre-flight ops | `validate` (required fields), `diff` (delta preview) — both read-only, no write attempt needed |
| Cardinality without fetch | `count` returns single integer — never fetch 20 docs to know there are 3 |

### Phase 2 targets (agent hardening)
| Principle | What to build |
|-----------|--------------|
| MCP adapter | `mcp/index.ts` stdio server — typed tools, read-only by default, mutations behind opt-in |
| `--wait` on async jobs | Block until Frappe background job completes. ERPNext bulk ops are async. |
| Command allowlisting | `--enable-verbs get,describe` — restrict surface for sandboxed agent invocations |
| `validate --output json` | Structured `{"valid":false,"missing":[...]}` to stdout — exit code alone is enough for most use, but JSON output enables richer agent branching |

### Don'ts for dev agents (building/modifying frappe-ctl)
- **Never expose generic shell execution** in MCP — expose typed tools, not `bash(cmd)`
- **Never auto-paginate silently** — truncate with a message, let the agent decide to fetch more
- **Don't wrap free-text Frappe fields as structured data** — mark them as untrusted prose for LLM consumption
- **Don't mix auth flows** — self-hosted uses `token key:secret`, Frappe Cloud uses OAuth. Keep these separate code paths, never conflate.
- **Don't add `--sparse` / `--strip-meta` to write verbs that show dry-run previews** — dry-run output should show full data so the agent can verify what it's about to write
- **Don't cache DocType meta** — adds complexity, meta calls are fast, caching causes stale schema bugs
- **Don't add `process.exit` to new verbs** — only `validate.ts` exits with non-zero for validation results; all other exits go through `die()` in `main().catch`

---

## Operator Agent Dos and Don'ts

These apply to agents **using** frappe-ctl to operate ERPNext (read, write, automate), not agents building the CLI itself.

### Session startup
```bash
# Always run at session start — compact schema + live counts for your DocTypes
frappe-ctl next agent-context \
  --doctypes "Project,Sales Order,Purchase Order,Customer" \
  --compact \
  --include-counts
```

### Token efficiency rules
- **Always use `--sparse`** when fetching docs for context (not for display). Measured 55% reduction.
- **Use `count` before `get`** when you only need cardinality. Never fetch 20 docs to answer "how many are there?"
- **Use `describe --required`** before creating a new DocType — 8 fields vs 170 fields.
- **Use `describe --relationships`** to understand linked DocTypes before planning multi-step ops.
- **Use `search` not `get --filter`** for fuzzy/text lookups. `get --filter` requires exact field values.
- **Use `link` not two `get` calls** when following a foreign key. `link SO-001 project` = 1 command vs 2.

### Before writing
- **Always `validate` before `create`** when payload is constructed dynamically. Exit code 0 = safe to proceed.
- **Always `diff` before `patch`** on important docs. Confirms you're changing the right fields.
- **Always `--dry-run` before `bulk`**. Dry-run lists every affected doc name — verify scope before committing.

### Safety rules
- **Never `delete` without first `count`ing** with the same filter. Know how many you're deleting.
- **Never `bulk delete` without `--dry-run` first** — always.
- **Never `patch` status fields directly** on submittable docs — use `submit`, `cancel`, or `workflow` instead. Direct status patches bypass Frappe's lifecycle validation.
- **`FRAPPE_CTL_READONLY=1`** — set this when the agent's task is read-only. Hard blocks all mutations.
- **Always check `validate` exit code** — it exits 1 on failure, 0 on success. Don't parse stderr to determine validity.

### Output parsing
- JSON is default when piped. Parse stdout as JSON directly.
- `count` outputs a plain integer string — `parseInt(stdout.trim())`.
- `validate` writes MISSING/UNKNOWN to **stderr**, exits 1. Stdout is empty on failure.
- `bulk` always outputs `{ total, success, failed, errors[] }` JSON to stdout — even on full success.
- `diff` always outputs to stdout as a text table — no JSON mode currently.
- Errors go to stderr. Data goes to stdout. Never mix them.

### Efficient patterns
```bash
# Pattern: find and fetch (2 calls instead of fetch-all-filter)
frappe-ctl next search Project "V Builders" --sparse
frappe-ctl next count "Sales Order" --filter "project=PROJ-0005"

# Pattern: follow the graph
frappe-ctl next link "Sales Order" SAL-ORD-001 project --sparse

# Pattern: pre-flight before create
frappe-ctl next validate "Purchase Order" --data '{"supplier":"Acme","items":[...]}'
# exit 0 → proceed; exit 1 → fix payload

# Pattern: preview before patch
frappe-ctl next diff Project PROJ-001 --data '{"status":"Completed","custom_sanction_amount":18000}'

# Pattern: bulk with confirmation
frappe-ctl next bulk patch "Sales Order" --filter "status=Draft" --data '{"status":"Cancelled"}' --dry-run
# → review list of affected docs
frappe-ctl next bulk patch "Sales Order" --filter "status=Draft" --data '{"status":"Cancelled"}'
```

---

## client.ts Method Reference

| Method | Transport | Notes |
|--------|-----------|-------|
| `getDoc(doctype, name)` | GET `/api/resource/{doctype}/{name}` | Returns `res.data` |
| `listDocs(doctype, opts)` | GET `/api/resource/{doctype}` | Always sends `fields=["*"]` |
| `countDocs(doctype, filters?)` | POST `frappe.client.get_count` | Returns number |
| `searchDocs(doctype, query, searchField, opts?)` | GET via `listDocs` | Builds `[searchField, "like", "%query%"]` filter |
| `createDoc(doctype, data)` | POST `/api/resource/{doctype}` | Returns `res.data` |
| `updateDoc(doctype, name, data)` | PUT `/api/resource/{doctype}/{name}` | Returns `res.data` |
| `deleteDoc(doctype, name)` | DELETE `/api/resource/{doctype}/{name}` | Returns void |
| `callMethod(method, data?)` | POST `/api/method/{method}` | Returns `res.message` |
| `submitDoc(doctype, name)` | POST `frappe.client.submit` | Returns `res.message` |
| `cancelDoc(doctype, name)` | POST `frappe.client.cancel` | Returns `res.message` |
| `getDocTypeMeta(doctype)` | POST `frappe.client.get` on DocType | Returns `res.message` |
| `runReport(name, filters?)` | POST `frappe.desk.query_report.run` | Returns `ReportResult` |
| `listDocTypes(modules?)` | POST `frappe.client.get_list` | POST not GET — URL length limit |
| `listAll(doctype, filters?, fields?)` | GET loop via `listDocs` | Paginates 100/page until page < 100. Returns all matching docs. |
| `uploadFile(doctype, docname, filename, buffer, isPrivate)` | POST `upload_file` multipart | Returns `res.message` — NOT JSON body |
| `downloadPdf(doctype, name, format?, noLetterhead?)` | GET `frappe.utils.print_format.download_pdf` | Returns `Uint8Array` — binary, not JSON |

## output.ts Utilities

| Export | What |
|--------|------|
| `sparseDoc(doc)` | Strip null/undefined/empty-string/zero fields. Keeps semantic zeros via `KEEP_ZERO` set. |
| `stripMetaDoc(doc)` | Remove Frappe system fields (owner, creation, modified, utm_*, etc.) via `META_FIELDS` set. |
| `applyOutputFilters(doc, opts)` | Applies strip-meta first, then sparse. Both optional. |
| `printDoc(doc, fmt, opts?)` | Print single doc — applies output filters if opts set. |
| `printDocs(docs, fmt, opts?)` | Print doc list — maps `applyOutputFilters` over all docs if opts set. |
| `detectFormat(flag?)` | Resolve OutputFormat from flag string or TTY detection. |

## Known Frappe Quirks

| Quirk | Detail |
|-------|--------|
| `fields` default | Frappe returns only `name` unless you explicitly request fields. `listDocs` always sends `fields=["*"]`. |
| `in` filter format | Comma-string, not array. See above. |
| `is_single` blocked | Not in `frappe.client.get_list` allowlist for DocType queries. |
| Report caching | Always pass `ignore_prepared_report: 1` to `frappe.desk.query_report.run` or you get stale data. |
| submit/cancel | These are ERPNext-specific lifecycle states. `docstatus`: 0=Draft, 1=Submitted, 2=Cancelled. |
| HTTP 417 | Frappe throws `DataError` (mapped to 417) on disallowed fields or malformed filters — not a transport error. |
| `upload_file` auth | Does NOT use JSON body — multipart FormData. Auth header same `token key:secret` but no `Content-Type: application/json`. |
| `download_pdf` response | Binary response, not JSON. Don't call `res.text()` or `JSON.parse()`. Use `res.arrayBuffer()`. |
| URLSearchParams spaces | Encodes spaces as `+` not `%20`. Use `.replace(/\+/g, ' ')` before `decodeURIComponent` in tests. |
| workflow method | `frappe.model.workflow.apply_workflow` takes `{doc: {doctype, name}, action}` — `doc` is nested object. |
| `listAll` pagination boundary | Stops when page returns < 100 docs (PAGE constant). Tests must NOT include an empty-page mock when count < 100 — it gets consumed as the next op's response. |
| bulk mock count | `bulk patch` on N docs needs N+1 fetch mocks: 1 list call + N PUT calls (assuming N < 100). Add extra list mocks only when testing >100-doc pagination. |
| bulk result shape | Always outputs `{ total, success, failed, errors[] }` JSON to stdout even on full success. Never throws on per-doc failure — catches and records. |
| OAuth vs api_key headers | Self-hosted: `Authorization: token key:secret`. OAuth: `Authorization: Bearer <access_token>`. Never mix — see ADR-001 and ADR-009. |
| OAuth is per-site | No central Frappe Cloud IDP. Each `*.erpnext.com` / `*.frappe.cloud` site runs its own OAuth server. client_id is per-site. |
| PKCE S256 only | Frappe's `code_challenge_methods_supported` = `["S256"]`. Plain is not listed. Always use S256. |
| Redirect URI needs explicit port | Register `http://localhost:PORT` not `http://localhost` — Frappe has a known redirect bug with portless `http://localhost` (github.com/frappe/erpnext/issues/15763). |
| `FRAPPE_CTL_NO_KEYCHAIN=1` | Forces file-only token storage. Required for CI and tests — prevents writing to the real OS keychain. |
| Silent token refresh | `cli.ts` checks token expiry before building `FrappeClient`. If expired + refresh token available: auto-refreshes silently. If refresh fails: falls back to api_key. |
| `describe --required` JSON output | JSON path uses `{ ...meta, fields }` where `fields` is already filtered. Never output raw `meta` in the catch-all JSON case — it bypasses all filter flags. |
| `title_field` on DocType meta | Present on the top-level DocType object (not in the `fields` array). Used by `search` to determine which field to search. Absent on many DocTypes — fall back to `TITLE_FIELD_FALLBACKS` list in `search.ts`. |
