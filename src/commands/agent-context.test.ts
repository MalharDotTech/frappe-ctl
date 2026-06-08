import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { cmdAgentContext } from "./agent-context.ts";

describe("cmdAgentContext", () => {
  afterEach(() => spyOn(console, "log").mockRestore());

  it("outputs valid JSON", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAgentContext();

    const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
    expect(parsed).toBeDefined();
  });

  it("includes schema version", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAgentContext();

    const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
    expect(parsed.schema_version).toBeDefined();
    expect(typeof parsed.schema_version).toBe("string");
  });

  it("lists all apps with alias and modules", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAgentContext();

    const parsed = JSON.parse(logs[0]!) as { apps: { alias: string; modules: string[] }[] };
    expect(Array.isArray(parsed.apps)).toBe(true);
    expect(parsed.apps.length).toBeGreaterThan(0);
    const next = parsed.apps.find((a) => a.alias === "next");
    expect(next).toBeDefined();
    expect(next!.modules).toContain("Selling");
  });

  it("lists all verbs with description and flags", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAgentContext();

    const parsed = JSON.parse(logs[0]!) as { verbs: { name: string; description: string }[] };
    expect(Array.isArray(parsed.verbs)).toBe(true);
    const verbNames = parsed.verbs.map((v) => v.name);
    expect(verbNames).toContain("get");
    expect(verbNames).toContain("create");
    expect(verbNames).toContain("submit");
    expect(verbNames).toContain("resources");
  });

  it("includes examples for each verb", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAgentContext();

    const parsed = JSON.parse(logs[0]!) as { verbs: { name: string; example: string }[] };
    for (const verb of parsed.verbs) {
      expect(verb.example).toBeTruthy();
    }
  });

  it("includes readonly_safe flag on each verb", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAgentContext();

    const parsed = JSON.parse(logs[0]!) as { verbs: { name: string; readonly_safe: boolean }[] };
    const getVerb = parsed.verbs.find((v) => v.name === "get")!;
    const createVerb = parsed.verbs.find((v) => v.name === "create")!;
    expect(getVerb.readonly_safe).toBe(true);
    expect(createVerb.readonly_safe).toBe(false);
  });
});
