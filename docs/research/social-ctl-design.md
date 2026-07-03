# social-ctl — Design Draft: Provider Interface & Auth Strategy

**Status:** research draft (not an ADR — nothing committed to build yet)
**Date:** 2026-07-03
**Context:** Estimate for a kubectl-style, agent-native CLI that posts content to social platforms, in the frappe-ctl mold. Reference points: Postiz (self-hosted, ~17k LOC provider/auth layer, Temporal + Postgres + Redis), Buffer's new GraphQL API (beta), and the mid-2026 state of each platform's official posting API.
**Constraint that shapes everything:** maintained by two people. Every design choice below optimizes for *bounded, predictable maintenance*, not platform coverage.

---

## 1. Goals / Non-goals

### Goals
- `social-ctl [--account <profile>] <platform> post ...` — pipe-safe JSON stdout, exit codes, agent-native (same principles as frappe-ctl).
- Multi-account per platform via named profiles (the frappe-ctl `--site` pattern, renamed `--account`).
- Auth handled once per *auth kind*, not once per platform.
- Zero external runtime deps, no daemon, no database, no job queue.

### Non-goals (each one deletes a Postiz subsystem)
- **No scheduling.** `cron`/`at`/CI runs `social-ctl` — the OS is the scheduler. Deletes Temporal + workflow versioning (~2.5k LOC in Postiz).
- **No analytics, comments, DMs, stories.** Post + verify only. This is >60% of Postiz's per-provider LOC.
- **No web UI, no multi-tenant.** Deletes NestJS + Postgres + Redis.
- **No browser automation as a core path.** Research verdict: Instagram and LinkedIn restrict accounts on device-fingerprint/session mismatch, not volume; selector churn is a permanent treadmill. If ever added, it's an isolated opt-in provider, CDP-attach to the user's real Chrome, and its breakage must never block the API providers.

---

## 2. Auth Strategy (the core of the estimate)

### 2.1 The insight that keeps this maintainable

Across every platform we researched, auth collapses into **three kinds**. The CLI core implements each kind exactly once; a provider *declares* its kind as data. Per-provider auth code approaches zero.

| Auth kind | Mechanism | Platforms | Core implementation |
|---|---|---|---|
| `token` | User pastes a long-lived credential once | Bluesky (app password), Mastodon (settings-page token), Buffer (personal API key), Telegram (bot token), dev.to-class APIs | Prompt/flag → token-store. **Zero refresh logic. Zero developer app.** |
| `oauth` (PKCE) | OAuth2 auth-code + PKCE, loopback redirect | X, Threads, Instagram (Business), Facebook Pages, YouTube, TikTok, Reddit, Pinterest | Already exists: frappe-ctl `oauth.ts` (PKCE S256, fixed-port loopback — ADR-009/011) generalizes with per-provider endpoint/scope data |
| `oauth-secret` | OAuth2 auth-code, client secret required, no PKCE | LinkedIn | Same flow; secret lives in the user's profile (acceptable: it's *their own* single-user dev app, same trust level as an api_secret in frappe-ctl) |

The user always brings their own developer app per OAuth platform (client_id, sometimes secret) — exactly like Postiz self-hosting, and unavoidable on any path. That's a one-time ~30–60 min setup per platform, documented per provider. It is *setup* cost, not *maintenance* cost.

### 2.2 Refresh is data, not code

Each provider declares a `refresh` strategy; the core owns the four implementations:

| Strategy | Behavior at call time | Platforms |
|---|---|---|
| `none` | Token never expires; use as-is | Bluesky¹, Mastodon, Buffer, Telegram |
| `standard` | `grant_type=refresh_token` when access token is expired/near expiry | X, YouTube, TikTok, Reddit, Pinterest |
| `exchange` | Platform-specific long-lived-token exchange before expiry (Meta's `th_refresh_token` / `ig_refresh_token` / `fb_exchange_token`) | Threads, Instagram, Facebook Pages |
| `reauth` | Cannot refresh programmatically. On expiry → `AuthRequiredError` → **exit 4** + message: `run: social-ctl auth login linkedin --account <p>` | LinkedIn (refresh tokens are gated behind Marketing Developer Platform partnership) |

¹ Bluesky session JWTs rotate, but re-login with the stored app password is transparent — behaves as `none` from the user's view.

**No background refresh. Ever.** Refresh happens lazily, at invocation:

```
before request:
  if expires_at within 5-min window → run declared refresh strategy
  on success  → persist new tokens, proceed
  on failure  → mark profile refresh_needed, throw AuthRequiredError (exit 4)
```

This is the load-bearing simplification versus Postiz. Postiz needs Temporal workflows sleeping until `tokenExpiration` because it's a server that must post unattended at 3am. A CLI runs when invoked — if the token is refreshable, refresh inline (adds one HTTP call); if not, exit 4 and let the operator (human or agent) re-auth. frappe-ctl already established this exact taxonomy (ADR-022: exit 4 = auth required; silent token refresh with fallback in `cli.ts`). Operator agents branch on the exit code.

The one real cost: **Meta's 60-day tokens can lapse if you don't post for 60+ days** (the exchange needs a still-valid token). Mitigation is one line in the same lazy path — refresh opportunistically whenever the token is >30 days old on any invocation — plus a `social-ctl auth status` command that prints per-profile expiry so a weekly agent cron can alert. Accepted tradeoff: a fully idle profile for 60+ days requires re-login. That's fine for a personal tool.

### 2.3 Storage and multi-account

Reuse frappe-ctl's proven pieces verbatim:

- **Token store:** keychain + file fallback `0o600` (`token-store.ts`), `FRAPPE_CTL_NO_KEYCHAIN`-style opt-out for CI. Entry key: `<provider>/<profile>`.
- **Config:** `configDir()`-style functions reading `SOCIAL_CTL_CONFIG_DIR` at call time (testability — never constants).
- **Profiles:**

```jsonc
// profiles.json (no tokens in here — tokens live in the token store)
{
  "profiles": {
    "personal.x":  { "provider": "x",        "clientId": "...", "label": "@malhar" },
    "work.x":      { "provider": "x",        "clientId": "...", "label": "@malhardottech" },
    "me.bluesky":  { "provider": "bluesky",  "handle": "malhar.dev", "service": "https://bsky.social" },
    "biz.ig":      { "provider": "instagram","clientId": "...", "igUserId": "..." },
    "me.buffer":   { "provider": "buffer" }
  },
  "aliases": { "everywhere": ["personal.x", "me.bluesky", "me.mastodon"] }
}
```

- `social-ctl auth login <provider> --account work.x` → runs the declared auth kind → stores tokens.
- `social-ctl post --account everywhere "text"` → fan-out, per-target result in one JSON array, per-target failures never abort the batch (Postiz's bulk-result shape: `{total, success, failed, errors[]}` — same as frappe-ctl's bulk verb).

### 2.4 Credential hygiene (carry ADR-020 forward)

- No token/secret ever appears in a thrown error message, `--debug` output, or JSON stdout. Port frappe-ctl's credential-leak regression test on day one.
- `--debug` prints *which* auth path/profile is active, never values.

---

## 3. Provider Interface

Postiz's `SocialProvider` interface is the right shape but carries analytics, comments, 2-step page selection, Chrome-extension cookies, and web3 concerns. The lean version:

```typescript
// src/providers/provider.ts

export type AuthSpec =
  | { kind: "token"; fields: TokenField[] }            // prompt-or-flag inputs
  | {
      kind: "oauth";
      authUrl: string;
      tokenUrl: string;
      scopes: string[];
      pkce: boolean;                                    // false → client secret required
      refresh: "none" | "standard" | "exchange" | "reauth";
      refreshUrl?: string;                              // Meta exchange endpoints etc.
    };

export type TokenField = { name: string; label: string; secret: boolean };

export interface Capabilities {
  text: { maxChars: number };
  images?: { max: number; formats: string[] };
  video?: { maxBytes: number; formats: string[] };
  link?: "inline" | "attachment" | "unsupported";
  mediaSource: "upload" | "public-url";                 // ⚠ see §3.2
}

export interface Post {
  text: string;
  media?: { path: string; alt?: string }[];
  link?: string;
  replyToId?: string;                                    // threads/chains where supported
}

export interface PostResult { id: string; url?: string }
export interface AccountInfo { id: string; username: string; displayName?: string }

export interface Provider {
  id: string;                                            // "x", "bluesky", "buffer"
  auth: AuthSpec;
  capabilities: Capabilities;

  post(ctx: AuthedCtx, post: Post): Promise<PostResult>;
  verify(ctx: AuthedCtx): Promise<AccountInfo>;          // `auth status` / whoami
  del?(ctx: AuthedCtx, id: string): Promise<void>;       // where the API allows it
}

// AuthedCtx = { fetch: wrappedFetch; tokens: TokenSet; profile: Profile }
// wrappedFetch owns: retry on 429/5xx (bounded), 401 → AuthRequiredError,
// and the credential-leak boundary. Providers never touch raw tokens.
```

Design rules (mirroring frappe-ctl's command rules):
- One file per provider: `src/providers/<id>.ts` exporting a single `Provider` object + colocated `<id>.test.ts`. No provider imports another provider.
- Providers contain **request-shaping only** — endpoints, payload mapping, error interpretation. All auth, refresh, retry, storage, output formatting live in core. This is what keeps a provider at 100–400 LOC instead of Postiz's ~450–1,100.
- Validation before write: `social-ctl validate` checks text length / media count against `capabilities` *offline* — the `validate`-before-`apply` pre-flight pattern, exit 1 + `--output json`.
- New provider checklist = the "Adding a New Verb" checklist, adapted; a `skill-file.test.ts`-style freshness check keeps docs/provider list in sync.

### 3.1 Error taxonomy (unchanged from frappe-ctl)

| Exit | Meaning |
|---|---|
| 0 | success |
| 1 | validation failure / API error (message on stderr, structured JSON on stdout where applicable) |
| 4 | auth required — no profile, expired non-refreshable token, or HTTP 401 (`reauth` platforms land here by design) |

### 3.2 The media-staging problem (only genuinely new plumbing)

Instagram and TikTok don't accept uploads on the publish call — **they pull media from a public HTTPS URL**. A local CLI must stage `./photo.jpg` somewhere public first. This is the one place social-ctl needs infrastructure frappe-ctl never did.

Lean answer: a `mediaSource: "public-url"` capability flag plus one pluggable `stage(file) → url` hook with two built-ins: S3/R2 presigned upload (user supplies a bucket, ~80 LOC, zero deps via `fetch` + SigV4) or "user passes `--media-url` directly." Providers with `mediaSource: "upload"` (X, Mastodon, Bluesky, LinkedIn, YouTube) never touch it. Phase it: text-only IG doesn't exist (IG requires media), so **Instagram simply waits for the staging hook** rather than complicating phase 1.

---

## 4. Buffer: a provider, not a foundation

Findings on Buffer's current API (mid-2026):

- The 2019 public REST API remains **closed to new developer registrations** — the thing most "Buffer API" pages describe is dead for us.
- The **new GraphQL API** (`api.buffer.com`) is in **public beta** with **personal API keys** (Bearer header, created in account settings — no OAuth dance, no developer app). Supports `createPost` (immediate or `customScheduled` + `dueAt`), delete, list channels/organization, across **11 channels**: X, Instagram, Facebook, LinkedIn, TikTok, Threads, YouTube, Pinterest, Google Business Profile, Mastodon, Bluesky.
- **Media caveat:** images work via `imageUrl` (public URL — same staging problem as §3.2); **native video upload is not yet exposed in the beta** → YouTube/TikTok posting through Buffer is effectively blocked until they ship it.
- **Plan limits:** beta API is free but plan-gated — Free plan: 1 API key, ~100 requests/24h, 3 channels, 10 queued posts/channel, lifetime cap of 8 channel connections. Paid ~$5–6/channel/mo lifts limits.
- **Platform risk is the real story:** Buffer killed a 47,000-client public API in 2019; the new one is beta with no SLA. Treat it as revocable.

**Verdict:** Buffer slots into the architecture as **one `token`-kind provider (~150 LOC)** — the single cheapest way to reach Meta platforms with zero developer-app setup, and a useful escape hatch while native Meta providers are unbuilt. It must not *be* the architecture: if Buffer changes course (they have before), we lose one provider file, not the tool. Same posture for Late/Ayrshare-class aggregators — the interface treats "aggregator" as just another provider.

Interesting consequence: **phase 1 + Buffer covers ~13 channels** with only `token`-kind auth — no OAuth code exercised at all until we choose to build native X/Meta providers.

---

## 5. Platform → auth-kind map & maintenance budget

| Provider | Auth kind | Refresh | Dev app? | Media | Est. LOC | Maint. risk |
|---|---|---|---|---|---|---|
| bluesky | token (app password) | none | no | upload | ~120 | **low** |
| mastodon | token | none | no | upload | ~100 | **low** |
| buffer | token (API key) | none | no | public-url (img only) | ~150 | **low** (but revocable — beta) |
| x | oauth PKCE | standard | yes (pay-per-use: $0.015/post, $0.20 w/ link) | upload | ~250 | **medium** (pricing churn) |
| threads | oauth PKCE | exchange (60d) | yes (Meta, dev mode) | public-url | ~200 | **medium-low** |
| linkedin | oauth-secret | **reauth** (60d wall) | yes | upload | ~300 | **medium** (re-auth UX) |
| facebook pages | oauth PKCE | exchange | yes (same Meta app) | mixed | ~350 | **medium** |
| instagram (Business) | oauth PKCE | exchange | yes (same Meta app) | public-url + staging | ~350 | **medium-high** |
| youtube | oauth PKCE | standard | yes (GCP; **public uploads need audit** — else private-locked) | upload (resumable) | ~300 | **high** — recommend Buffer/aggregator or accept private |
| tiktok | oauth PKCE | standard | yes (**content audit gates public posts**) | public-url | ~350 | **high** — same recommendation |

**Phasing:**
- **Phase 1 — token-only (a weekend to a week):** core (config/profiles/token-store/output/auth kinds `token`) + bluesky + mastodon + buffer. ~1.5–2k LOC with tests. Already posts to ~13 channels via Buffer.
- **Phase 2 — oauth core + X + Threads (~1 week):** generalize `oauth.ts`, lazy-refresh engine, `auth status`. ~1.5k LOC.
- **Phase 3 — Meta native + LinkedIn + media staging (~1–2 weeks):** the grind tier. Only build what Buffer doesn't already cover well enough.
- **Never (natively): YouTube-public, TikTok-public** — audit-gated for companies, not two-person tools.

**Steady-state maintenance estimate:** phase 1–2 scope ≈ *hours per quarter* (token-kind providers are near-zero; X pricing/endpoint churn is the main watch item). Full phase 3 scope ≈ *a few hours per month*, dominated by Meta ceremony. Compare: self-hosting Postiz = same developer-app burden + a 4-service stack + 17k LOC of someone else's provider code moving under you.

---

## 6. Open questions (decide before building)

1. **Repo:** new repo (`social-ctl`) sharing patterns by convention, or extract `oauth.ts`/`token-store.ts`/`output.ts` into a shared package? Lean answer: copy, don't abstract — two small copies beat one shared dep (zero-deps principle).
2. **Buffer-first posture:** is phase 1 + Buffer *enough* for the actual posting volume? If yes, phases 2–3 may never need building — measure before investing.
3. **Media staging backend:** R2 presign vs `--media-url` only in early phases.
4. **MCP:** mirror frappe-ctl's pattern later — read-only tools + `--allow-mutations` gate; `post` is a mutation tool. Not phase 1.
