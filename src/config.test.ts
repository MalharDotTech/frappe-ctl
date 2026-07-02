import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import {
  loadConfig,
  profileAdd,
  profileUse,
  profileList,
  profileRemove,
  getActiveProfile,
} from "./config.ts";

// Each test gets an isolated temp dir — never touches ~/.config/frappe-ctl
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(import.meta.dir, `.test-config-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  process.env["FRAPPE_CTL_CONFIG_DIR"] = tmpDir;
});

afterEach(() => {
  delete process.env["FRAPPE_CTL_CONFIG_DIR"];
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns empty config when no file exists", () => {
    const cfg = loadConfig();
    expect(cfg.default).toBe("");
    expect(cfg.profiles).toEqual({});
  });
});

describe("profileAdd — file permissions", () => {
  it("writes config.json as owner-only (0600) — api_key/api_secret are sensitive", () => {
    profileAdd("uat", "http://localhost:8080", "key1", "secret1");
    const mode = statSync(join(tmpDir, "config.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("profileAdd", () => {
  it("saves a profile and sets it as default when first", () => {
    profileAdd("uat", "http://localhost:8080", "key1", "secret1");
    const cfg = loadConfig();
    expect(cfg.profiles["uat"]).toEqual({
      url: "http://localhost:8080",
      api_key: "key1",
      api_secret: "secret1",
    });
    expect(cfg.default).toBe("uat");
  });

  it("does not overwrite default when a default already exists", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    profileAdd("prod", "https://prod.example.com", "k2", "s2");
    const cfg = loadConfig();
    expect(cfg.default).toBe("uat"); // first added stays default
  });

  it("overwrites existing profile with same name", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    profileAdd("uat", "http://localhost:9090", "k2", "s2");
    const cfg = loadConfig();
    expect(cfg.profiles["uat"]?.url).toBe("http://localhost:9090");
  });
});

describe("profileUse", () => {
  it("switches active profile", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    profileAdd("prod", "https://prod.example.com", "k2", "s2");
    profileUse("prod");
    expect(loadConfig().default).toBe("prod");
  });

  it("throws when profile does not exist", () => {
    expect(() => profileUse("nonexistent")).toThrow("not found");
  });
});

describe("profileRemove", () => {
  it("removes a profile", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    profileRemove("uat");
    expect(loadConfig().profiles["uat"]).toBeUndefined();
  });

  it("switches default to next available when active profile removed", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    profileAdd("prod", "https://prod.example.com", "k2", "s2");
    profileRemove("uat");
    expect(loadConfig().default).toBe("prod");
  });

  it("throws when profile does not exist", () => {
    expect(() => profileRemove("ghost")).toThrow("not found");
  });
});

describe("getActiveProfile", () => {
  it("returns profile matching default", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    const profile = getActiveProfile(loadConfig());
    expect(profile.url).toBe("http://localhost:8080");
  });

  it("respects override over default", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    profileAdd("prod", "https://prod.example.com", "k2", "s2");
    const profile = getActiveProfile(loadConfig(), "prod");
    expect(profile.url).toBe("https://prod.example.com");
  });

  it("throws descriptive error when no profile configured", () => {
    expect(() => getActiveProfile(loadConfig())).toThrow("No active profile");
  });

  it("throws descriptive error when named profile missing", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    expect(() => getActiveProfile(loadConfig(), "ghost")).toThrow("not found");
  });
});

describe("profileAdd — app_versions", () => {
  it("saves app_versions when provided", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1", { next: "v16", hr: "v16" });
    const profile = loadConfig().profiles["uat"]!;
    expect(profile.app_versions).toEqual({ next: "v16", hr: "v16" });
  });

  it("saves profile without app_versions when not provided", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1");
    const profile = loadConfig().profiles["uat"]!;
    expect(profile.app_versions).toBeUndefined();
  });

  it("merges app_versions on overwrite — new versions win, old survive", () => {
    profileAdd("uat", "http://localhost:8080", "k1", "s1", { next: "v15" });
    profileAdd("uat", "http://localhost:8080", "k1", "s1", { next: "v16", hr: "v16" });
    const profile = loadConfig().profiles["uat"]!;
    expect(profile.app_versions?.["next"]).toBe("v16");
    expect(profile.app_versions?.["hr"]).toBe("v16");
  });
});
