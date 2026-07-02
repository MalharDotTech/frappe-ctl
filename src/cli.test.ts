import { describe, it, expect } from "bun:test";
import { isVerbAllowed, exitCodeFor } from "./cli.ts";
import { FrappeRequestError } from "./client.ts";
import { AuthRequiredError } from "./errors.ts";

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
