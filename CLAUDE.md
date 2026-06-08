# frappe-ctl — Claude Dev Context

Read this before touching anything. These are the established conventions — don't drift from them.

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
  client.ts           All HTTP — getDoc, listDocs, callMethod, etc.
  config.ts           Profile CRUD — functions not constants
  apps.ts             App registry — alias, modules, supportedVersions
  output.ts           Table / CSV formatters
  commands/           One file per verb
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

## Known Frappe Quirks

| Quirk | Detail |
|-------|--------|
| `fields` default | Frappe returns only `name` unless you explicitly request fields. `listDocs` always sends `fields=["*"]`. |
| `in` filter format | Comma-string, not array. See above. |
| `is_single` blocked | Not in `frappe.client.get_list` allowlist for DocType queries. |
| Report caching | Always pass `ignore_prepared_report: 1` to `frappe.desk.query_report.run` or you get stale data. |
| submit/cancel | These are ERPNext-specific lifecycle states. `docstatus`: 0=Draft, 1=Submitted, 2=Cancelled. |
| HTTP 417 | Frappe throws `DataError` (mapped to 417) on disallowed fields or malformed filters — not a transport error. |
