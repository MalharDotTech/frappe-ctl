import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { cmdAuthStatus, cmdAuthLogout } from "./auth.ts";

// ── Test isolation ──────────────────────────────────────────────────────────

let tempDir: string;
let origConfigDir: string | undefined;
let origKeychain: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "fctl-auth-test-"));
  origConfigDir = process.env["FRAPPE_CTL_CONFIG_DIR"];
  origKeychain = process.env["FRAPPE_CTL_NO_KEYCHAIN"];
  process.env["FRAPPE_CTL_CONFIG_DIR"] = tempDir;
  process.env["FRAPPE_CTL_NO_KEYCHAIN"] = "1";
});

afterEach(() => {
  spyOn(globalThis, "fetch").mockRestore();
  if (origConfigDir === undefined) delete process.env["FRAPPE_CTL_CONFIG_DIR"];
  else process.env["FRAPPE_CTL_CONFIG_DIR"] = origConfigDir;
  if (origKeychain === undefined) delete process.env["FRAPPE_CTL_NO_KEYCHAIN"];
  else process.env["FRAPPE_CTL_NO_KEYCHAIN"] = origKeychain;
  rmSync(tempDir, { recursive: true, force: true });
});

// Helper: write a minimal config + optional token file into tempDir
function writeConfig(profile: Record<string, unknown>, defaultName = "test") {
  const cfg = { default: defaultName, profiles: { [defaultName]: profile } };
  writeFileSync(join(tempDir, "config.json"), JSON.stringify(cfg));
}

function writeTokens(tokens: Record<string, unknown>) {
  const f = join(tempDir, "tokens.json");
  writeFileSync(f, JSON.stringify(tokens), { mode: 0o600 });
}

const profile = {
  url: "https://demo.erpnext.com",
  api_key: "key",
  api_secret: "secret",
  client_id: "client_abc",
};

const storedToken = {
  access_token: "tok_123",
  refresh_token: "ref_456",
  expires_at: Date.now() + 3_600_000,  // 1 hour from now
  client_id: "client_abc",
};

// ── cmdAuthStatus ────────────────────────────────────────────────────────────

describe("cmdAuthStatus", () => {
  it("reports api_key auth when no token stored", () => {
    writeConfig(profile);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    cmdAuthStatus({});
    const out = logs.join("\n");
    expect(out).toContain("api_key");
  });

  it("reports OAuth Bearer when valid token exists", () => {
    writeConfig(profile);
    writeTokens({ "https://demo.erpnext.com": storedToken });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    cmdAuthStatus({});
    const out = logs.join("\n");
    expect(out).toContain("Bearer");
    expect(out).not.toContain("EXPIRED");
    expect(out).toContain("client_abc");
  });

  it("reports EXPIRED when token is past expires_at", () => {
    writeConfig(profile);
    const expired = { ...storedToken, expires_at: Date.now() - 5000 };
    writeTokens({ "https://demo.erpnext.com": expired });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    cmdAuthStatus({});
    expect(logs.join("\n")).toContain("EXPIRED");
  });

  it("uses --site override", () => {
    writeConfig(profile, "prod");
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    cmdAuthStatus({ site: "prod" });
    expect(logs.join("\n")).toContain("demo.erpnext.com");
  });

  it("throws when profile not found", () => {
    writeConfig(profile, "prod");
    expect(() => cmdAuthStatus({ site: "ghost" })).toThrow(/ghost/);
  });
});

// ── cmdAuthLogout ────────────────────────────────────────────────────────────

describe("cmdAuthLogout", () => {
  it("deletes stored token", async () => {
    writeConfig(profile);
    writeTokens({ "https://demo.erpnext.com": storedToken });
    // revokeToken hits the network — mock it to succeed silently
    spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAuthLogout({});

    // Token file should no longer contain the site
    const { loadToken } = await import("../token-store.ts");
    expect(loadToken("https://demo.erpnext.com")).toBeNull();
    expect(logs.join("\n")).toContain("demo.erpnext.com");
  });

  it("succeeds with no-op when no token exists", async () => {
    writeConfig(profile);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await expect(cmdAuthLogout({})).resolves.toBeUndefined();
    expect(logs.join("\n")).toContain("demo.erpnext.com");
  });

  it("revoke failure does not block logout (best-effort)", async () => {
    writeConfig(profile);
    writeTokens({ "https://demo.erpnext.com": storedToken });
    // Server returns error — should still clear local token
    spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("error", { status: 500 }));

    await expect(cmdAuthLogout({})).resolves.toBeUndefined();

    const { loadToken } = await import("../token-store.ts");
    expect(loadToken("https://demo.erpnext.com")).toBeNull();
  });
});

// ── cmdAuthLogin error paths ──────────────────────────────────────────────────
// The full interactive PKCE flow (browser + local server) can't be unit tested.
// Test the guard conditions only.

describe("cmdAuthLogin error paths", () => {
  it("throws when no client_id in profile and none passed", async () => {
    const { cmdAuthLogin } = await import("./auth.ts");
    writeConfig({ url: "https://demo.erpnext.com", api_key: "k", api_secret: "s" });

    await expect(cmdAuthLogin({})).rejects.toThrow(/client.?id/i);
  });

  it("throws when profile not found", async () => {
    const { cmdAuthLogin } = await import("./auth.ts");
    writeConfig(profile, "prod");

    await expect(cmdAuthLogin({ site: "ghost" })).rejects.toThrow(/ghost/);
  });
});
