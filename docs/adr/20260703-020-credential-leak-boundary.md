---
adr: "020"
title: "Credential security boundary: code-level no-leak guarantee, not OS-level ACL"
date: 2026-07-03
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [security, credentials, keychain, agent-native]
---

# ADR-020: Credential security boundary is code-level, not OS-level

## Decision
frappe-ctl guarantees raw secrets (`api_key`, `api_secret`, OAuth `access_token`/`refresh_token`, the constructed `Authorization` header) never appear in any output a calling process — including an AI agent invoking `frappe-ctl` as a subprocess — can observe: stdout, stderr, thrown error messages, or logs. It does **not** attempt to guarantee that another process running as the same OS user is blocked from reading the credential out of the Keychain directly; that would require a fundamentally different implementation (see Context) and is explicitly out of scope for now.

## Context
Prompted by comparing frappe-ctl's credential storage (`token-store.ts`, `config.ts`) against how other agent-facing CLIs (`gogcli`, `gh`) handle secrets, plus a direct request to make secrets unreachable by any agent operating the tool.

Two distinct security properties were being conflated:

1. **Code-level**: the secret never surfaces in anything `frappe-ctl` prints. This is fully within the codebase's control, requires no native code, works identically on every platform.
2. **OS-level**: even a separate process running as the same user (e.g. an agent's own shell) cannot read the Keychain item without a macOS-enforced prompt.

A spike (2026-07-03) proved (2) is not achievable with frappe-ctl's current architecture. `token-store.ts` shells out to `/usr/bin/security` via `Bun.spawnSync`. Empirically: an item created this way was read back successfully, with zero prompt and exit code 0, from a completely unrelated fresh subshell — no `-T`/`-A` flags needed. macOS's Keychain ACL trusts whichever process calls the Keychain API, and that's always `/usr/bin/security` — a system utility any process on the machine can invoke identically. Trust is not scoped to `frappe-ctl` at all; anything that knows the account/service key pair (`frappe-ctl:<site-url>`) can extract the secret the same way frappe-ctl does.

`gogcli` achieves (2) because it is a compiled, code-signed binary calling the Keychain Services API directly (via Go's `99designs/keyring`) — macOS's ACL trusts that specific signed binary's identity, not a shared system tool. Reproducing this for frappe-ctl would require: a compiled binary (not the current `bun run src/cli.ts` script path), a stable code-signing identity, and native Security.framework calls (via `bun:ffi`, non-trivial — `SecItemAdd`/`SecItemCopyMatching` take `CFDictionary`/`CFTypeRef` arguments that `bun:ffi` doesn't cleanly marshal). It would also be macOS-only — Linux (Secret Service) and Windows (Credential Manager) have no equivalent in frappe-ctl today regardless. Even `gogcli` itself has an open bug (steipete/gogcli#206) where this exact mechanism silently writes an empty token when the Keychain is locked in a headless session — the OS-level guarantee is fragile even for tools built for it from the ground up.

Given zero-dependency (ADR-003) and cross-platform goals, and that the actual threat frappe-ctl needs to defend against — an agent seeing the raw key in its own context via tool output — is fully addressed by (1), pursuing (2) was rejected as disproportionate effort for this cycle.

A follow-up audit (2026-07-03) confirmed (1) already held across the codebase: `authHeader` in `client.ts` is a private field only ever used to set the `Authorization` request header, never interpolated into a thrown `Error`; `FrappeRequestError` messages are built from HTTP status/statusText and the *server's* response body, never from request state; `profileList()` in `config.ts` deliberately omits `api_key`/`api_secret`; no `--debug`/`--verbose` flag exists yet that could print request internals. Two gaps were found and fixed as part of this ADR: `config.ts::saveConfig()` wrote `api_key`/`api_secret` to disk with no file-mode restriction (fixed: `0o600`, matching `token-store.ts`), and `token-store.ts::saveToken()` silently fell back to plaintext file storage when a Keychain write failed for a reason *other* than deliberate opt-out (`FRAPPE_CTL_NO_KEYCHAIN=1`) — the exact anti-pattern `gh` CLI shipped and had to walk back (cli/cli#8954). Fixed: warn to stderr on unexpected Keychain failure, silent only on deliberate opt-out.

## Consequences
- ✅ Guarantee holds today, verified by audit, and is now regression-tested (`client.test.ts` — "never leaks credentials into error output", covering HTTP error, network failure, and malformed-JSON paths)
- ✅ Cross-platform, zero-dependency, no native code required
- ✅ Keychain write failures are now loud (stderr warning) instead of silently degrading protection, unless explicitly opted out via `FRAPPE_CTL_NO_KEYCHAIN=1`
- ⚠️ Any future `--debug`/`--verbose` flag (tracked in `ROADMAP.md`, chctl-inspired) MUST print only the credential *source* (e.g. "profile file" or "keychain"), never the value — this ADR is the constraint that governs that feature when it's built
- ⚠️ Does not protect against another process running as the same OS user directly querying the Keychain for `frappe-ctl:<site-url>` — this is a known, accepted gap, not an oversight
- ⚠️ If true per-process ACL scoping is wanted later, it requires a compiled+signed binary and native Security.framework calls — macOS-only, multi-week effort, should get its own ADR and be scoped as a dedicated project, not folded into routine roadmap work
