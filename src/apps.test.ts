import { describe, it, expect } from "bun:test";
import { resolveApp, resolveAppVersion, isVersionSupported, APPS } from "./apps.ts";

describe("resolveApp", () => {
  it("returns app def for known alias", () => {
    const app = resolveApp("next");
    expect(app.name).toBe("ERPNext");
    expect(app.alias).toBe("next");
  });

  it("throws for unknown alias with list of known apps", () => {
    expect(() => resolveApp("unknown")).toThrow("Unknown app");
    expect(() => resolveApp("unknown")).toThrow("next");
  });
});

describe("AppDef versioning", () => {
  it("every app has currentStable in vX format", () => {
    for (const [alias, app] of Object.entries(APPS)) {
      expect(app.currentStable).toMatch(/^v\d+$/, `${alias}.currentStable must be vX format`);
    }
  });

  it("every app has at least one supported version", () => {
    for (const [alias, app] of Object.entries(APPS)) {
      expect(app.supportedVersions.length).toBeGreaterThan(0, `${alias} needs supportedVersions`);
    }
  });

  it("currentStable is always in supportedVersions", () => {
    for (const [alias, app] of Object.entries(APPS)) {
      expect(app.supportedVersions).toContain(
        app.currentStable,
        `${alias}.currentStable must be in supportedVersions`,
      );
    }
  });

  it("all version strings are vX format (no minor, no patch)", () => {
    for (const [alias, app] of Object.entries(APPS)) {
      for (const v of app.supportedVersions) {
        expect(v).toMatch(/^v\d+$/, `${alias} version '${v}' must be vX format, not vX.Y or vX.Y.Z`);
      }
    }
  });
});

describe("isVersionSupported", () => {
  it("returns true for supported version", () => {
    expect(isVersionSupported("next", "v16")).toBe(true);
  });

  it("returns false for unsupported version", () => {
    expect(isVersionSupported("next", "v10")).toBe(false);
  });

  it("returns false for malformed version string", () => {
    expect(isVersionSupported("next", "16")).toBe(false);
    expect(isVersionSupported("next", "v16.21")).toBe(false);
    expect(isVersionSupported("next", "v16.21.1")).toBe(false);
  });
});

describe("resolveAppVersion", () => {
  it("returns version from profile app_versions when set", () => {
    const version = resolveAppVersion("next", { "next": "v15" });
    expect(version).toBe("v15");
  });

  it("falls back to currentStable when profile has no version for app", () => {
    const version = resolveAppVersion("next", {});
    expect(version).toBe(APPS["next"]!.currentStable);
  });

  it("falls back to currentStable when profile app_versions undefined", () => {
    const version = resolveAppVersion("next", undefined);
    expect(version).toBe(APPS["next"]!.currentStable);
  });
});
