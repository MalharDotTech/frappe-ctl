import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { detectFormat } from "./output.ts";
import { AGENT_ENV_VARS } from "./agent-detect.ts";

const ALL_VARS = [...AGENT_ENV_VARS, "AGENT", "AI_AGENT"];
let saved: Record<string, string | undefined>;
let ttyDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  saved = {};
  for (const v of ALL_VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
});

afterEach(() => {
  for (const v of ALL_VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
  if (ttyDescriptor) Object.defineProperty(process.stdout, "isTTY", ttyDescriptor);
});

function setTTY(value: boolean) {
  Object.defineProperty(process.stdout, "isTTY", { value, configurable: true });
}

describe("detectFormat — explicit flag always wins", () => {
  it("returns json for --output json regardless of TTY or agent env", () => {
    setTTY(true);
    process.env["CLAUDECODE"] = "1";
    expect(detectFormat("json")).toBe("json");
  });

  it("returns table for --output table even under agent env", () => {
    process.env["CLAUDECODE"] = "1";
    expect(detectFormat("table")).toBe("table");
  });

  it("returns csv for --output csv", () => {
    expect(detectFormat("csv")).toBe("csv");
  });
});

describe("detectFormat — TTY detection (no flag, no agent env)", () => {
  it("returns table when stdout is a TTY", () => {
    setTTY(true);
    expect(detectFormat()).toBe("table");
  });

  it("returns json when stdout is not a TTY (piped)", () => {
    setTTY(false);
    expect(detectFormat()).toBe("json");
  });
});

describe("detectFormat — agent env var forces json even when TTY lies", () => {
  it("returns json when CLAUDECODE is set, even if stdout.isTTY is true", () => {
    setTTY(true);
    process.env["CLAUDECODE"] = "1";
    expect(detectFormat()).toBe("json");
  });

  it("returns json when the generic AGENT env var is set, even if stdout.isTTY is true", () => {
    setTTY(true);
    process.env["AGENT"] = "some-unlisted-tool";
    expect(detectFormat()).toBe("json");
  });
});
