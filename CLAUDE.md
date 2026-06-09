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

**Design:** agent-native, pipe-safe JSON stdout, no external deps, profile-based multi-site.

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

---

## File Layout

```
src/
  cli.ts              Entry + arg parser (no external deps)
  client.ts           All HTTP — getDoc, listDocs, callMethod, uploadFile, downloadPdf
  config.ts           Profile CRUD — functions not constants
  apps.ts             App registry — alias, modules, supportedVersions
  output.ts           Table / CSV formatters
  commands/
    auth.ts           OAuth login/logout/status (PKCE flow)
    get.ts            list + single fetch
    describe.ts       DocType schema
    apply.ts          create/update from JSON file or stdin
    write.ts          create, patch, delete
    lifecycle.ts      submit, cancel
    workflow.ts       ERPNext workflow action transitions
    attach.ts         multipart file upload
    print.ts          binary PDF download
    logs.ts           Frappe Error Log tail
    bulk.ts           filter-scoped patch/delete with listAll pagination
    call.ts           raw whitelisted method call
    report.ts         saved Report runner
    resources.ts      DocType lister per app
    agent-context.ts  machine-readable JSON schema
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
- Config isolation: set `process.env.FRAPPE_CTL_CONFIG_DIR` to a temp dir in `beforeEach`, restore in `afterEach`
- Fixtures in `src/__fixtures__/api-responses.ts` — add shapes there, not inline in tests
- Fixture format for `callMethod` responses: `{ message: <payload> }` (not `{ data: ... }`)
- Fixture format for `listDocs` / `getDoc` responses: `{ data: <payload> }`

Target: every new verb gets its own `*.test.ts` with at minimum: happy path, filter/flag behaviour, output format (table + json).

---

## Adding a New Verb

1. Create `src/commands/<verb>.ts` — export `cmd<Verb>(client, args)`
2. Create `src/commands/<verb>.test.ts` — write tests first
3. Add fixture shapes to `src/__fixtures__/api-responses.ts`
4. Wire into `cli.ts` verb router (`switch (args.verb)`)
5. Add to `usage()` string in `cli.ts`
6. If the verb introduces a non-obvious design choice → create `docs/adr/YYYYMMDD-NNN-title.md`

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
3. Add test to `apps.test.ts` verifying the new app passes invariants

---

## Style Rules

- No comments unless the WHY is non-obvious (hidden constraint, Frappe quirk, known bug workaround)
- No error handling for things that can't happen — trust internal guarantees
- No abstractions beyond what the current task needs
- Short variable names are fine; precise names are better than long names
- `die(msg)` for all fatal CLI errors — it logs to stderr and exits 1
- Never `process.exit` anywhere except `die()` and `main().catch`

---

## Agent-Native Design Principles (don't compromise these)

Drawn from gogcli, Trevin's 10 principles, and openclaw integration requirements. These inform every new feature decision.

### Locked in (already implemented)
| Principle | How frappe-ctl does it |
|-----------|----------------------|
| Non-interactive by default | No prompts. `--force` for destructive ops. |
| JSON stdout when piped | `process.stdout.isTTY` check on every command |
| Errors to stderr, data to stdout | `die()` uses `console.error`, data uses `console.log` |
| Exit codes | 0 = success, 1 = any error |
| Named profiles | `profile add/use/list/remove` + `--site` override |
| `FRAPPE_CTL_CONFIG_DIR` | Sandboxed config per agent session |
| Bounded responses | Default `--limit 20` on `get` |

### ERPNext Phase 1 — complete ✅
All items shipped. No remaining Phase 1 items.

### Phase 2 targets (agent hardening)
| Principle | What to build |
|-----------|--------------|
| MCP adapter | `mcp/index.ts` stdio server — typed tools, read-only by default, mutations behind opt-in |
| `--wait` on async jobs | Block until Frappe background job completes. ERPNext bulk ops are async. |
| Command allowlisting | `--enable-verbs get,describe` — restrict surface for sandboxed agent invocations |

### Don'ts (from gogcli + openclaw learnings)
- **Never expose generic shell execution** in MCP — expose typed tools, not `bash(cmd)`
- **Never auto-paginate silently** — truncate with a message, let the agent decide to fetch more
- **Don't wrap free-text Frappe fields as structured data** — mark them as untrusted prose for LLM consumption
- **Don't mix auth flows** — self-hosted uses `token key:secret`, Frappe Cloud will use OAuth. Keep these separate code paths, never conflate.

---

## client.ts Method Reference

| Method | Transport | Notes |
|--------|-----------|-------|
| `getDoc(doctype, name)` | GET `/api/resource/{doctype}/{name}` | Returns `res.data` |
| `listDocs(doctype, opts)` | GET `/api/resource/{doctype}` | Always sends `fields=["*"]` |
| `countDocs(doctype, filters?)` | POST `frappe.client.get_count` | Returns number |
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
