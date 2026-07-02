import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { isAgentInvocation, AGENT_ENV_VARS } from "./agent-detect.ts";

// Snapshot and clear every var this module cares about so tests never
// leak the real invocation environment (this suite itself may run under
// Claude Code, Codex, etc — CLAUDECODE is very likely already set).
const ALL_VARS = [...AGENT_ENV_VARS, "AGENT", "AI_AGENT"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const v of ALL_VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
});

afterEach(() => {
  for (const v of ALL_VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("isAgentInvocation", () => {
  it("returns false when no agent env vars are set", () => {
    expect(isAgentInvocation()).toBe(false);
  });

  it("returns true when CLAUDECODE is set", () => {
    process.env["CLAUDECODE"] = "1";
    expect(isAgentInvocation()).toBe(true);
  });

  it("returns true when CURSOR_AGENT is set", () => {
    process.env["CURSOR_AGENT"] = "1";
    expect(isAgentInvocation()).toBe(true);
  });

  it("returns true when CODEX_SANDBOX is set", () => {
    process.env["CODEX_SANDBOX"] = "1";
    expect(isAgentInvocation()).toBe(true);
  });

  it("returns true for every known tool-specific var", () => {
    for (const v of AGENT_ENV_VARS) {
      process.env[v] = "1";
      expect(isAgentInvocation()).toBe(true);
      delete process.env[v];
    }
  });

  it("returns true for the generic AGENT env var (gh/kubectl convention)", () => {
    process.env["AGENT"] = "some-unlisted-tool";
    expect(isAgentInvocation()).toBe(true);
  });

  it("returns true for the generic AI_AGENT env var", () => {
    process.env["AI_AGENT"] = "1";
    expect(isAgentInvocation()).toBe(true);
  });

  it("ignores an empty-string AGENT value", () => {
    process.env["AGENT"] = "";
    expect(isAgentInvocation()).toBe(false);
  });

  it("ignores unrelated env vars", () => {
    process.env["HOME"] = "/Users/someone";
    process.env["PATH"] = "/usr/bin";
    expect(isAgentInvocation()).toBe(false);
  });
});
