---
adr: "009"
title: "Frappe Cloud OAuth uses PKCE with user-supplied client_id — no DCR"
date: 2026-06-10
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.1.0"
tags: [auth, oauth, security, frappe-cloud]
---

# ADR-009: Frappe Cloud OAuth — PKCE, explicit client_id, no Dynamic Client Registration

## Decision
`frappe-ctl auth login --site <url> --client-id <id>` triggers PKCE Authorization Code flow. User pre-registers an OAuth Client on the Frappe site (public client, no secret). CLI stores the client_id in the profile. Dynamic Client Registration (DCR) is not used.

## Context
Three options were evaluated: (1) explicit client_id supplied by user, (2) DCR via `/api/method/frappe.integrations.oauth2.register_client`, (3) bundled client_id per domain suffix. Option 2 (DCR) is not guaranteed to be enabled on every Frappe Cloud site. Option 3 is fragile and couples the binary to site configuration. Option 1 requires one manual step but is universally supported, fully secure, and keeps the code path simple.

No central Frappe Cloud IDP exists — each site (`*.erpnext.com`, `*.frappe.cloud`) runs its own OAuth server. Auth is per-site, not per-cloud-account.

PKCE uses S256 only (plain not in Frappe's `code_challenge_methods_supported`). State parameter required in CLI to prevent CSRF. Redirect target is `http://localhost:<random_port>` — explicit port required (Frappe has a known redirect bug with portless `http://localhost`). Access tokens are opaque, 1hr TTL. Refresh tokens included.

Token storage: macOS Keychain via `security` CLI, Linux `secret-tool`, fallback `~/.config/frappe-ctl/credentials` with `chmod 600`. Tokens never stored in `config.json` alongside profile metadata.

Header for OAuth-authenticated calls: `Authorization: Bearer <access_token>` — distinct from self-hosted `Authorization: token key:secret`.

## Consequences
- ✅ Works on any Frappe site regardless of DCR configuration
- ✅ Public client — no client_secret ever stored or transmitted
- ✅ PKCE makes code interception attacks useless without the verifier
- ⚠️ One manual setup step per site (register OAuth Client in admin UI)
- ⚠️ Two auth code paths in `client.ts` — self-hosted vs cloud — must never be conflated
