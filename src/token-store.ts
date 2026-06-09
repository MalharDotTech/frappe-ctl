import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;  // Unix ms — when the access_token expires
  client_id: string;
}

type TokenStore = Record<string, StoredToken>;

// Read env at call time — same isolation pattern as config.ts (ADR-004)
function tokenFile(): string {
  const dir = process.env["FRAPPE_CTL_CONFIG_DIR"]
    ?? join(process.env["HOME"] ?? "~", ".config", "frappe-ctl");
  return join(dir, "tokens.json");
}

function loadFileStore(): TokenStore {
  const f = tokenFile();
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8")) as TokenStore;
  } catch {
    return {};
  }
}

function saveFileStore(store: TokenStore): void {
  const f = tokenFile();
  const dir = join(f, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // 0o600 — owner read/write only. Tokens never world-readable.
  writeFileSync(f, JSON.stringify(store, null, 2) + "\n", { mode: 0o600, encoding: "utf8" });
}

// ── macOS Keychain ─────────────────────────────────────────────────────────────
// Uses `security` CLI (built into macOS, zero deps). ADR-003.

function keychainKey(siteUrl: string): string {
  return `frappe-ctl:${siteUrl}`;
}

function keychainSave(siteUrl: string, value: string): boolean {
  if (process.platform !== "darwin") return false;
  if (process.env["FRAPPE_CTL_NO_KEYCHAIN"] === "1") return false;
  const result = Bun.spawnSync([
    "security", "add-generic-password",
    "-a", "frappe-ctl",
    "-s", keychainKey(siteUrl),
    "-w", value,
    "-U",  // update if exists
  ]);
  return result.exitCode === 0;
}

function keychainLoad(siteUrl: string): string | null {
  if (process.platform !== "darwin") return null;
  if (process.env["FRAPPE_CTL_NO_KEYCHAIN"] === "1") return null;
  const result = Bun.spawnSync([
    "security", "find-generic-password",
    "-a", "frappe-ctl",
    "-s", keychainKey(siteUrl),
    "-w",  // print password only
  ]);
  if (result.exitCode !== 0) return null;
  return new TextDecoder().decode(result.stdout).trim() || null;
}

function keychainDelete(siteUrl: string): void {
  if (process.platform !== "darwin") return;
  if (process.env["FRAPPE_CTL_NO_KEYCHAIN"] === "1") return;
  Bun.spawnSync([
    "security", "delete-generic-password",
    "-a", "frappe-ctl",
    "-s", keychainKey(siteUrl),
  ]);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function saveToken(siteUrl: string, token: StoredToken): void {
  const value = JSON.stringify(token);
  // Try keychain first; file store is always updated as fallback
  const keychainOk = keychainSave(siteUrl, value);
  if (keychainOk) return;  // Keychain succeeded — don't duplicate to file
  const store = loadFileStore();
  store[siteUrl] = token;
  saveFileStore(store);
}

export function loadToken(siteUrl: string): StoredToken | null {
  // Keychain first
  const raw = keychainLoad(siteUrl);
  if (raw) {
    try {
      return JSON.parse(raw) as StoredToken;
    } catch {
      // corrupt keychain entry — fall through
    }
  }
  // File store
  const store = loadFileStore();
  return store[siteUrl] ?? null;
}

export function deleteToken(siteUrl: string): void {
  keychainDelete(siteUrl);
  const store = loadFileStore();
  delete store[siteUrl];
  saveFileStore(store);
}

export function isTokenExpired(token: StoredToken, bufferMs = 60_000): boolean {
  // Consider expired if within bufferMs of actual expiry — proactive refresh
  return Date.now() >= token.expires_at - bufferMs;
}
