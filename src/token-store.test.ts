import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Each test gets a throw-away dir injected via FRAPPE_CTL_CONFIG_DIR
// (same isolation pattern as config.test.ts)

let tempDir: string;
let origEnv: string | undefined;
let origKeychain: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "fctl-token-test-"));
  origEnv = process.env["FRAPPE_CTL_CONFIG_DIR"];
  origKeychain = process.env["FRAPPE_CTL_NO_KEYCHAIN"];
  process.env["FRAPPE_CTL_CONFIG_DIR"] = tempDir;
  // Force file-only mode so tests don't write to the real OS keychain
  process.env["FRAPPE_CTL_NO_KEYCHAIN"] = "1";
});

afterEach(() => {
  if (origEnv === undefined) delete process.env["FRAPPE_CTL_CONFIG_DIR"];
  else process.env["FRAPPE_CTL_CONFIG_DIR"] = origEnv;
  if (origKeychain === undefined) delete process.env["FRAPPE_CTL_NO_KEYCHAIN"];
  else process.env["FRAPPE_CTL_NO_KEYCHAIN"] = origKeychain;
  rmSync(tempDir, { recursive: true, force: true });
});

// Re-import after env is set — functions read env at call time (ADR-004)
async function store() {
  return await import("./token-store.ts");
}

const siteUrl = "https://demo.erpnext.com";
const sampleToken = {
  access_token: "abc123",
  refresh_token: "ref456",
  expires_at: Date.now() + 3_600_000,
  client_id: "client_xyz",
};

describe("token-store (file fallback)", () => {
  it("returns null when no token exists", async () => {
    const { loadToken } = await store();
    expect(loadToken(siteUrl)).toBeNull();
  });

  it("saves and loads a token keyed by site URL", async () => {
    const { saveToken, loadToken } = await store();
    saveToken(siteUrl, sampleToken);
    const loaded = loadToken(siteUrl);
    expect(loaded).not.toBeNull();
    expect(loaded!.access_token).toBe("abc123");
    expect(loaded!.refresh_token).toBe("ref456");
    expect(loaded!.client_id).toBe("client_xyz");
  });

  it("isolates tokens by site URL", async () => {
    const { saveToken, loadToken } = await store();
    const other = { ...sampleToken, access_token: "other_token" };
    saveToken(siteUrl, sampleToken);
    saveToken("https://other.erpnext.com", other);
    expect(loadToken(siteUrl)!.access_token).toBe("abc123");
    expect(loadToken("https://other.erpnext.com")!.access_token).toBe("other_token");
  });

  it("overwrites existing token on save", async () => {
    const { saveToken, loadToken } = await store();
    saveToken(siteUrl, sampleToken);
    const updated = { ...sampleToken, access_token: "new_token" };
    saveToken(siteUrl, updated);
    expect(loadToken(siteUrl)!.access_token).toBe("new_token");
  });

  it("deletes a token", async () => {
    const { saveToken, loadToken, deleteToken } = await store();
    saveToken(siteUrl, sampleToken);
    deleteToken(siteUrl);
    expect(loadToken(siteUrl)).toBeNull();
  });

  it("delete is idempotent when token does not exist", async () => {
    const { deleteToken } = await store();
    expect(() => deleteToken(siteUrl)).not.toThrow();
  });

  it("creates token file with restrictive permissions", async () => {
    const { saveToken } = await store();
    saveToken(siteUrl, sampleToken);
    const tokenFile = join(tempDir, "tokens.json");
    const stat = Bun.file(tokenFile);
    expect(await stat.exists()).toBe(true);
    // Bun doesn't expose stat.mode directly — check via fs
    const { statSync } = await import("fs");
    const mode = statSync(tokenFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("warns to stderr when a Keychain write fails — not just when it's disabled", async () => {
    // Distinct from FRAPPE_CTL_NO_KEYCHAIN=1 (deliberate opt-out, no warning needed):
    // here Keychain is attempted but the `security` call itself fails
    // (locked keychain, denied, etc). Silently degrading to plaintext file
    // without telling the user is the exact anti-pattern gh CLI shipped
    // (cli/cli#8954) — must fail loud instead.
    delete process.env["FRAPPE_CTL_NO_KEYCHAIN"];
    const origPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    const spawnSpy = spyOn(Bun, "spawnSync").mockReturnValue({
      exitCode: 1,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
    } as ReturnType<typeof Bun.spawnSync>);
    const errSpy = spyOn(console, "error").mockImplementation(() => {});

    const { saveToken, loadToken } = await store();
    saveToken(siteUrl, sampleToken);

    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0]?.[0]).toContain("Keychain");
    // Still recoverable — file fallback must still work despite the warning
    expect(loadToken(siteUrl)).toEqual(sampleToken);

    spawnSpy.mockRestore();
    errSpy.mockRestore();
    Object.defineProperty(process, "platform", { value: origPlatform });
  });

  it("does not warn when Keychain is deliberately disabled via env var", async () => {
    // FRAPPE_CTL_NO_KEYCHAIN=1 is set in beforeEach — deliberate opt-out
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const { saveToken } = await store();
    saveToken(siteUrl, sampleToken);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("isTokenExpired", () => {
  it("returns false for a fresh token", async () => {
    const { isTokenExpired } = await store();
    const token = { ...sampleToken, expires_at: Date.now() + 3_600_000 };
    expect(isTokenExpired(token)).toBe(false);
  });

  it("returns true for an expired token", async () => {
    const { isTokenExpired } = await store();
    const token = { ...sampleToken, expires_at: Date.now() - 1000 };
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns true within the buffer window", async () => {
    const { isTokenExpired } = await store();
    // expires in 30s — default buffer is 60s, so treated as expired
    const token = { ...sampleToken, expires_at: Date.now() + 30_000 };
    expect(isTokenExpired(token)).toBe(true);
  });

  it("respects custom buffer", async () => {
    const { isTokenExpired } = await store();
    const token = { ...sampleToken, expires_at: Date.now() + 30_000 };
    expect(isTokenExpired(token, 10_000)).toBe(false);  // 30s > 10s buffer
  });
});
