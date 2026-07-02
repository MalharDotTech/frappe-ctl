# frappe-ctl — Claude Dev Context

**Version:** `package.json → version` only. README, ADRs, agent-context derive from it.
**Design choices:** check `docs/adr/` first. If recorded, don't relitigate. New choice → new ADR.

---

## What This Is

`kubectl`-style Bun/TypeScript CLI for the Frappe ecosystem.

```
frappe-ctl [--site <profile>] <app> <verb> <DocType> [name] [flags]
```

Agent-native, pipe-safe JSON stdout, token-efficient output filters, zero external deps, profile-based multi-site.

---

## Process

BDD → TDD → Code. Write test first, make it fail, then implement. No code without a test.

---

## Auth — Critical

```
Authorization: token <api_key>:<api_secret>
```

NOT `Bearer`, NOT `Basic`. Every transport layer uses this. See `src/client.ts` constructor.

---

## Key Technical Decisions

### Versioning: `vX` only
`v14`, `v15`, `v16` — major only. `vX.Y` is rejected.

### Frappe `in` filter — comma-string, not array
```typescript
["module", "in", "Accounts,Buying,Selling"]   // ✅
["module", "in", ["Accounts", "Buying"]]       // ❌ — server returns 417
```

### `listDocTypes` uses POST not GET
`GET /api/resource/DocType` hits URL length limits with 10+ modules. POST via `frappe.client.get_list`. `is_single` not in allowlist — don't request it.

### Config functions not constants
`configDir()` / `configFile()` read `FRAPPE_CTL_CONFIG_DIR` at call time. Tests inject temp dir. Never convert to constants.

### Output pipe-safe
TTY → table. Non-TTY → JSON. Always check `process.stdout.isTTY`. Known agent env var (`agent-detect.ts::isAgentInvocation()`) forces JSON ahead of the TTY check — some agent harnesses attach a pty (ADR-023).

### `delete` requires `--force`
Never silently delete. `force: false` → throw. Intentional data-loss protection.

### `sparseDoc` KEEP_ZERO allowlist
`sparseDoc()` strips zeros — except semantic zeros (`docstatus`, `qty`, `grand_total`, `per_billed`, etc.). New zero-meaningful fields → add to `KEEP_ZERO` in `output.ts`.

### `describe` filters before JSON output
`--required/--relationships/--compact/--names-only` filter `fields` array. JSON output uses `{ ...meta, fields }` — NOT raw `meta`. Reverting bypasses all filters silently.

### `search` 2-call pattern
No `--field` → `getDocTypeMeta` first (for `title_field`), then `searchDocs`. `--field` collapses to 1 call. No meta caching.

### `agent-context` two paths
Bare `frappe-ctl agent-context` → early-return, static schema, no client. `frappe-ctl next agent-context --doctypes` → verb router, has client. Keep separate. `--include-counts` must never silently return zero counts when no client.

### `validate` uses `process.exit(1)`, not `die()`
Validation failure = exit 1. `die()` is for usage errors and infra failures. Operator agents branch on exit code.

### `validate --output json`
Produces `{valid, required, missing, unknown}` on stdout on both pass AND fail. Exit code unchanged (0/1). Stdout NOT empty on exit 1.

### `--enable-verbs` gate placement
Checked after READONLY, before verb router. `isVerbAllowed()` exported as pure function for unit tests. Empty string blocks all verbs — intentional.

### `--wait` only on `call` verb
Detects `job_name` (string) in `callMethod` response. Calls `client.waitForJob`. `failed` → `call.ts` throws. `finished` → outputs `info.result`. No `job_name` → silent no-op.

### `waitForJob` test opts
Pass `{ intervalMs: 0 }` to skip sleep. Use `mockResolvedValue` (not `Once`) for timeout test.

### MCP tool scope bounded
5 read-only + 3 mutation tools. Names `frappe_*` snake_case. `frappe_validate` logic inlined in `mcp-server.ts` — not shared with `validate.ts`. Never expose `frappe_call` — typed tools only.

---

## File Layout

```
src/
  cli.ts              Entry + arg parser
  client.ts           All HTTP methods + waitForJob
  config.ts           Profile CRUD (functions not constants)
  apps.ts             App registry — alias, modules, versions, KEY_FIELDS
  output.ts           Formatters — sparseDoc, stripMetaDoc, applyOutputFilters
  agent-detect.ts     isAgentInvocation() — known agent env vars, forces JSON over TTY (ADR-023)
  mcp-server.ts       MCP stdio — 5 read-only + 3 mutation tools, --allow-mutations gate
  commands/
    auth.ts           OAuth PKCE login/logout/status
    get.ts            list + single fetch
    count.ts          count → plain integer
    search.ts         text search by title_field
    describe.ts       DocType schema (--required, --compact, --names-only, --relationships)
    link.ts           follow Link field → linked doc
    validate.ts       pre-flight required fields, Levenshtein suggestions, exit 1, --output json
    diff.ts           field delta preview (read-only)
    apply.ts          create/update from JSON file or stdin
    write.ts          create, patch, delete
    lifecycle.ts      submit, cancel
    workflow.ts       workflow action transitions
    attach.ts         multipart file upload
    print.ts          binary PDF download
    logs.ts           Error Log tail (--since, --compact)
    bulk.ts           filter-scoped patch/delete + listAll pagination
    call.ts           whitelisted method call (--wait for async jobs)
    report.ts         saved Report runner
    resources.ts      DocType lister per app
    agent-context.ts  static CLI schema + DocType-scoped compact schema
    skills.ts         installs frappe-ctl.skill.md into agent-specific dirs (skills install)
  oauth.ts            PKCE helpers
  token-store.ts      macOS Keychain + file fallback (0o600)
  errors.ts           AuthRequiredError — maps to exit code 4 (ADR-022)
  __fixtures__/       Shared mock responses
```

Each command exports one `cmd*` function. Commands call `client.*` and format output — nothing else.

---

## Testing

```bash
bun test
bun test src/commands/get.test.ts
```

- Tests colocated with source (`get.ts` → `get.test.ts`)
- Mock HTTP: `spyOn(globalThis, "fetch").mockResolvedValueOnce(...)`
- **Never re-spy on fetch inside a test** — use spy from initial `spyOn`. Re-spying gives stale counts.
- **`mockRestore()` AFTER assertions** on client method spies (e.g. `waitForJob`). Before = clears recorded calls.
- Config isolation: `process.env.FRAPPE_CTL_CONFIG_DIR` = temp dir in `beforeEach`, restore in `afterEach`
- Fixture format: `callMethod` → `{ message: <payload> }`, `listDocs`/`getDoc` → `{ data: <payload> }`
- Multi-call verbs: chain `mockResolvedValueOnce` on same spy — don't call `spyOn` multiple times
- `waitForJob` tests: `{ intervalMs: 0 }`. Timeout test: `mockResolvedValue` (not `Once`)
- Credential-leak regression guard: `client.test.ts` asserts `apiKey`/`apiSecret` never appear in a thrown `FrappeRequestError`'s `message`/`serverMessage` across HTTP-error, network-failure, and malformed-JSON paths (ADR-020). Extend this test whenever a new error-construction path is added to `client.ts`.

Every new verb: `*.test.ts` with happy path, flag behaviour, table + json output.

---

## Adding a New Verb

1. `src/commands/<verb>.ts` — export `cmd<Verb>(client, args)`
2. `src/commands/<verb>.test.ts` — write tests first
3. Add fixtures to `src/__fixtures__/api-responses.ts`
4. Wire into `cli.ts` verb router (`switch (args.verb)`)
5. Add to `usage()` in `cli.ts`
6. Add to `VERBS` in `src/commands/agent-context.ts`
7. Update CLAUDE.md file layout
8. Non-obvious choice → ADR

Doc-returning verbs: accept `sparse?` / `stripMeta?`, pass `{ sparse, stripMeta }` to `printDoc`/`printDocs`. Wire from top-level vars in `cli.ts`.

---

## Adding an ADR

File: `docs/adr/YYYYMMDD-NNN-kebab-title.md`

```yaml
---
adr: "NNN"
title: ""
date: YYYY-MM-DD
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: []
---
```

Sections: `## Decision` (1 sentence) · `## Context` · `## Consequences` (✅ pros, ⚠️ tradeoffs).

---

## Adding a New App

1. `APPS` in `src/apps.ts` — alias, name, description, supportedVersions, currentStable, modules
2. `modules` = exact Frappe module names (case-sensitive, used as filter values)
3. `KEY_FIELDS` in `src/apps.ts` — key fields per DocType for `agent-context --compact`
4. Test in `apps.test.ts` verifying invariants

---

## Style Rules

- No comments unless WHY is non-obvious (Frappe quirk, hidden constraint, known bug)
- No error handling for impossible cases
- No abstractions beyond current task
- `die(msg)` for fatal CLI errors — stderr + exit 1
- `process.exit` only in `die()`, `validate.ts` (exit 1), and `main().catch`

---

## Agent-Native Principles

### Implemented
| Principle | How |
|-----------|-----|
| Non-interactive | No prompts. `--force` for destructive ops. |
| JSON stdout piped | `process.stdout.isTTY` on every command |
| Stderr/stdout split | `die()` → stderr, data → stdout |
| Exit codes | 0 = success, 1 = error/validation failure, 4 = auth required (no profile, or HTTP 401 — NOT 403, see ADR-022) |
| Named profiles | `profile add/use/list/remove` + `--site` |
| Sandboxed config | `FRAPPE_CTL_CONFIG_DIR` |
| Bounded responses | Default `--limit 20` on `get` and `search` |
| Token efficiency | `--sparse` ~55%; `--strip-meta` removes system fields |
| Pre-flight ops | `validate`, `diff` — read-only before write |
| Cardinality | `count` = integer, no doc fetch |
| Structured validation | `validate --output json` → `{valid, required, missing, unknown}` |
| Surface-area limit | `--enable-verbs get,describe` sandboxes verb set |
| Async jobs | `call --wait` polls until `finished`/`failed` |
| MCP | `frappe-ctl mcp` — 5 read-only; `--allow-mutations` adds 3 |

### Phase 3
| Target | What |
|--------|------|
| Shell completions | bash/zsh/fish |
| Binary releases | `bun build --compile` via GitHub Actions |
| `--wait-timeout` | configurable for heavy jobs |
| `jobs` verb | list/cancel background jobs |

### Dev Agent Don'ts
- No generic shell execution in MCP — typed tools only
- No `frappe_call` MCP tool — no type safety, no audit trail
- No silent pagination — truncate + message, let agent decide
- No caching DocType meta — fast + complexity not worth it
- No `--sparse`/`--strip-meta` on dry-run previews — full data for verification
- No `process.exit` in new verbs — only `validate.ts` and `die()`
- No shared validation logic between `validate.ts` and `mcp-server.ts`
- Don't mix auth flows — `token key:secret` vs OAuth are separate paths

---

## Operator Agent Context

**Not in this file.** Operator patterns, token rules, safety, output parsing, MCP setup → `frappe-ctl.skill.md`.

This file is dev context only.

---

## client.ts Reference

| Method | Transport | Notes |
|--------|-----------|-------|
| `getDoc(doctype, name)` | GET `/api/resource/{doctype}/{name}` | Returns `res.data` |
| `listDocs(doctype, opts)` | GET `/api/resource/{doctype}` | Always `fields=["*"]` |
| `countDocs(doctype, filters?)` | POST `frappe.client.get_count` | Returns number |
| `searchDocs(doctype, query, field, opts?)` | GET via `listDocs` | `[field, "like", "%q%"]` |
| `createDoc(doctype, data)` | POST `/api/resource/{doctype}` | Returns `res.data` |
| `updateDoc(doctype, name, data)` | PUT `/api/resource/{doctype}/{name}` | Returns `res.data` |
| `deleteDoc(doctype, name)` | DELETE `/api/resource/{doctype}/{name}` | void |
| `callMethod(method, data?)` | POST `/api/method/{method}` | Returns `res.message` |
| `waitForJob(jobName, opts?)` | POST `frappe.utils.background_jobs.get_info` loop | `{intervalMs:0}` in tests. Default: 2s/60s. |
| `submitDoc(doctype, name)` | POST `frappe.client.submit` | Returns `res.message` |
| `cancelDoc(doctype, name)` | POST `frappe.client.cancel` | Returns `res.message` |
| `getDocTypeMeta(doctype)` | POST `frappe.client.get` | Returns `res.message` |
| `runReport(name, filters?)` | POST `frappe.desk.query_report.run` | Returns `ReportResult` |
| `listDocTypes(modules?)` | POST `frappe.client.get_list` | POST — URL length limit |
| `listAll(doctype, filters?, fields?)` | GET loop via `listDocs` | 100/page until page < 100 |
| `uploadFile(...)` | POST `upload_file` multipart | Returns `res.message` |
| `downloadPdf(...)` | GET `frappe.utils.print_format.download_pdf` | Returns `Uint8Array` |

## output.ts

| Export | What |
|--------|------|
| `sparseDoc(doc)` | Strip null/undefined/empty/zero. Keeps `KEEP_ZERO` set. |
| `stripMetaDoc(doc)` | Remove system fields via `META_FIELDS` set. |
| `applyOutputFilters(doc, opts)` | strip-meta then sparse, both optional. |
| `printDoc(doc, fmt, opts?)` | Single doc with output filters. |
| `printDocs(docs, fmt, opts?)` | Doc list with output filters. |
| `detectFormat(flag?)` | Resolve OutputFormat: flag > agent env var > TTY (ADR-023). |

## Known Frappe Quirks

| Quirk | Detail |
|-------|--------|
| `fields` default | Returns only `name` unless requested. `listDocs` always sends `fields=["*"]`. |
| `in` filter | Comma-string not array — `417` otherwise. |
| `is_single` blocked | Not in `frappe.client.get_list` allowlist. |
| Report caching | Pass `ignore_prepared_report: 1` or get stale data. |
| `docstatus` | 0=Draft, 1=Submitted, 2=Cancelled. |
| HTTP 417 | Disallowed fields or malformed filters — not transport error. |
| `upload_file` | Multipart FormData, no `Content-Type: application/json`. |
| `download_pdf` | Binary — use `res.arrayBuffer()`, not `res.text()`. |
| URLSearchParams | Spaces → `+` not `%20`. Use `.replace(/\+/g, ' ')` before `decodeURIComponent` in tests. |
| workflow | `apply_workflow` takes `{doc: {doctype, name}, action}` — `doc` is nested. |
| `listAll` boundary | Stops at page < 100. Tests must NOT mock empty page when count < 100. |
| bulk mocks | N docs = N+1 mocks: 1 list + N PUT. |
| bulk result | Always `{ total, success, failed, errors[] }`. Never throws on per-doc failure. |
| OAuth headers | Self-hosted: `token key:secret`. OAuth: `Bearer <token>`. Never mix — ADR-001, ADR-009. |
| OAuth per-site | No central IDP. Each site is its own OAuth server. client_id is per-site. |
| PKCE S256 only | `code_challenge_methods_supported = ["S256"]`. Always use S256. |
| Redirect URI | Must include port — `http://localhost:PORT`. Portless has Frappe bug. |
| `FRAPPE_CTL_NO_KEYCHAIN=1` | File-only token storage. Required for CI/tests. Deliberate opt-out — no stderr warning. |
| Keychain write failure | Unexpected `security` failure (locked, denied) warns to stderr, falls back to file. Silent only on `FRAPPE_CTL_NO_KEYCHAIN=1`. See ADR-020 — does NOT give per-process ACL isolation (spike showed any process can read the item via `security` CLI directly). |
| Silent token refresh | `cli.ts` auto-refreshes expired tokens. Falls back to api_key if refresh fails. |
| `describe` JSON | Use `{ ...meta, fields }` not raw `meta` — bypasses all filter flags. |
| `title_field` | Top-level on DocType object, not in `fields` array. Fall back to `TITLE_FIELD_FALLBACKS`. |
| `get_info` param | `{job_id: jobName}`. Terminal: `finished`/`failed`/`not_found`. Non-terminal: `queued`/`started`/`deferred`. |
