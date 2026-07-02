import { describe, it, expect } from "bun:test";
import { isVerbAllowed, exitCodeFor, debugInfo } from "./cli.ts";
import { FrappeRequestError } from "./client.ts";
import { AuthRequiredError } from "./errors.ts";
import type { Profile } from "./config.ts";
import type { StoredToken } from "./token-store.ts";

describe("isVerbAllowed", () => {
  it("allows everything when no allowlist set", () => {
    expect(isVerbAllowed("delete", undefined)).toBe(true);
    expect(isVerbAllowed("bulk", undefined)).toBe(true);
  });

  it("allows verb present in allowlist", () => {
    expect(isVerbAllowed("get", "get,describe,count")).toBe(true);
    expect(isVerbAllowed("describe", "get,describe,count")).toBe(true);
  });

  it("blocks verb absent from allowlist", () => {
    expect(isVerbAllowed("delete", "get,describe,count")).toBe(false);
    expect(isVerbAllowed("patch", "get,describe")).toBe(false);
  });

  it("trims whitespace around verb names", () => {
    expect(isVerbAllowed("get", "get, describe, count")).toBe(true);
    expect(isVerbAllowed("count", " get , count ")).toBe(true);
  });

  it("empty allowlist string blocks all verbs", () => {
    expect(isVerbAllowed("get", "")).toBe(false);
  });
});

describe("exitCodeFor", () => {
  it("returns 4 for AuthRequiredError", () => {
    expect(exitCodeFor(new AuthRequiredError("no profile"))).toBe(4);
  });

  it("returns 4 for FrappeRequestError with statusCode 401", () => {
    expect(exitCodeFor(new FrappeRequestError(401, "HTTP 401 Unauthorized"))).toBe(4);
  });

  it("returns 1 for FrappeRequestError with statusCode 403 — Frappe also uses 403 for plain PermissionError, not just auth failures", () => {
    expect(exitCodeFor(new FrappeRequestError(403, "HTTP 403 Forbidden"))).toBe(1);
  });

  it("returns 1 for a generic Error", () => {
    expect(exitCodeFor(new Error("something broke"))).toBe(1);
  });

  it("returns 1 for a non-Error thrown value", () => {
    expect(exitCodeFor("string error")).toBe(1);
  });
});

describe("debugInfo", () => {
  const profile: Profile = {
    url: "https://uat.example.com",
    api_key: "testkey123",
    api_secret: "testsecret456",
  };

  const validToken: StoredToken = {
    access_token: "atok_abc",
    refresh_token: "rtok_xyz",
    expires_at: Date.now() + 3_600_000,
    client_id: "client_1",
  };

  it("reports profile name and URL", () => {
    const lines = debugInfo("uat", profile, null);
    expect(lines.some((l) => l.includes("uat"))).toBe(true);
    expect(lines.some((l) => l.includes("https://uat.example.com"))).toBe(true);
  });

  it("reports api_key:api_secret auth when no valid token", () => {
    const lines = debugInfo("uat", profile, null);
    expect(lines.some((l) => l.includes("api_key:api_secret"))).toBe(true);
  });

  it("reports OAuth bearer auth when a valid token is active", () => {
    const lines = debugInfo("uat", profile, validToken);
    expect(lines.some((l) => l.includes("OAuth bearer"))).toBe(true);
  });

  it("reports api_key:api_secret when the token is expired", () => {
    const expired: StoredToken = { ...validToken, expires_at: Date.now() - 1000 };
    const lines = debugInfo("uat", profile, expired);
    expect(lines.some((l) => l.includes("api_key:api_secret"))).toBe(true);
  });

  // Regression guard per ADR-020: any --debug-style output must never print
  // the raw credential value, only its source.
  it("never includes the raw api_key or api_secret value", () => {
    const lines = debugInfo("uat", profile, null).join("\n");
    expect(lines).not.toContain(profile.api_key!);
    expect(lines).not.toContain(profile.api_secret!);
  });

  it("never includes the raw access_token or refresh_token value", () => {
    const lines = debugInfo("uat", profile, validToken).join("\n");
    expect(lines).not.toContain(validToken.access_token);
    expect(lines).not.toContain(validToken.refresh_token);
  });
});
