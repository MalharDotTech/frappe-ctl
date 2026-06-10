import { describe, it, expect } from "bun:test";
import { isVerbAllowed } from "./cli.ts";

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
