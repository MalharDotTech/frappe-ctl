---
adr: "026"
title: "bin wrapper resolves its own path through symlinks"
date: 2026-07-03
status: accepted
frappe_version: "v16"
frappe_ctl_version: "0.2.0"
tags: [bin, npm, bug, distribution]
---

# ADR-026: `bin/frappe-ctl` resolves through symlinks — `npm install -g` was broken

## Decision
`bin/frappe-ctl` resolves its own real location by looping through symlinks manually (POSIX-portable — no GNU-only `readlink -f`, since macOS ships BSD `readlink` without it), instead of a bare `dirname "$0"`.

## Context
Discovered while adding the `fctl` bin alias (`ROADMAP.md` Distribution bucket): verifying the alias worked through a simulated global install surfaced that **`npm install -g frappe-ctl` was already broken for everyone**, unrelated to the alias itself.

`npm install -g` always symlinks the bin into a separate global bin dir — e.g. `~/.npm-global/bin/frappe-ctl -> .../lib/node_modules/frappe-ctl/bin/frappe-ctl`. The wrapper's `DIR=$(cd "$(dirname "$0")" && pwd)` resolves relative to the symlink's own directory, not the real script's directory, since `$0` holds the invoked path (the symlink), not its target. Every real global install would run `frappe-ctl` and hit `Module not found ".../bin/../src/cli.ts"` — looking for `src/cli.ts` next to the global bin dir instead of next to the actual package.

Verified this wasn't a testing artifact before fixing: ran the actual production path — `npm pack` to build the real tarball, `npm install -g --prefix <fake-root> <tarball>` to create a real global install with real npm-generated symlinks, then executed the resulting binary. Confirmed broken, then confirmed the fix resolves it, using the identical real install — not just a manual `ln -s`.

No existing test covered the bin wrapper at all — the whole class of bug (symlink resolution) was entirely untested, which is how it shipped and stayed unnoticed through v0.2.0 and prior releases documented as npm-first install.

## Consequences
- ✅ Fixes a severity-blocking bug affecting the primary documented install path (`npm install -g frappe-ctl`) for every existing and future user
- ✅ `src/bin-wrapper.test.ts` (new) regression-tests direct invocation, symlinked invocation, and symlinked-under-a-different-name (the `fctl` alias case) — closes the "no test coverage at all" gap that let this ship
- ✅ Fix is POSIX `sh`-portable — explicitly avoids `readlink -f` (GNU-only; macOS's BSD `readlink` lacks it)
- ⚠️ This shipped broken in earlier releases (at least v0.2.0) — anyone who tried `npm install -g frappe-ctl` before this fix would have hit an immediate failure. Worth a patch release once merged.
