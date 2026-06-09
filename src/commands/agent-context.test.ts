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

  it("lists all 16 verbs with description and flags", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAgentContext();

    const parsed = JSON.parse(logs[0]!) as { verbs: { name: string; description: string }[] };
    expect(Array.isArray(parsed.verbs)).toBe(true);
    const verbNames = parsed.verbs.map((v) => v.name);
    // Core CRUD
    expect(verbNames).toContain("get");
    expect(verbNames).toContain("describe");
    expect(verbNames).toContain("apply");
    expect(verbNames).toContain("create");
    expect(verbNames).toContain("patch");
    expect(verbNames).toContain("delete");
    // Lifecycle
    expect(verbNames).toContain("submit");
    expect(verbNames).toContain("cancel");
    // ERPNext-specific
    expect(verbNames).toContain("workflow");
    expect(verbNames).toContain("attach");
    expect(verbNames).toContain("print");
    expect(verbNames).toContain("bulk");
    // Power verbs
    expect(verbNames).toContain("call");
    expect(verbNames).toContain("report");
    expect(verbNames).toContain("resources");
    expect(verbNames).toContain("logs");
    expect(parsed.verbs.length).toBe(16);
  });

  it("workflow verb is not readonly_safe", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
    await cmdAgentContext();
    const parsed = JSON.parse(logs[0]!) as { verbs: { name: string; readonly_safe: boolean }[] };
    expect(parsed.verbs.find((v) => v.name === "workflow")!.readonly_safe).toBe(false);
  });

  it("print verb is readonly_safe (downloads, does not mutate)", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
    await cmdAgentContext();
    const parsed = JSON.parse(logs[0]!) as { verbs: { name: string; readonly_safe: boolean }[] };
    expect(parsed.verbs.find((v) => v.name === "print")!.readonly_safe).toBe(true);
  });

  it("bulk verb documents sub-verbs and --force requirement", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
    await cmdAgentContext();
    const parsed = JSON.parse(logs[0]!) as { verbs: { name: string; flags: string[] }[] };
    const bulk = parsed.verbs.find((v) => v.name === "bulk")!;
    const flagStr = bulk.flags.join(" ");
    expect(flagStr).toContain("--force");
    expect(flagStr).toContain("--filter");
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

  it("schema_version is '2' (bumped after auth + bulk verbs added)", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
    await cmdAgentContext();
    const parsed = JSON.parse(logs[0]!) as { schema_version: string };
    expect(parsed.schema_version).toBe("2");
  });

  it("auth field documents both self-hosted and OAuth paths", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
    await cmdAgentContext();
    const parsed = JSON.parse(logs[0]!) as { auth: { self_hosted: string; frappe_cloud: string } };
    expect(parsed.auth.self_hosted).toContain("token");
    expect(parsed.auth.frappe_cloud).toContain("Bearer");
  });

  it("env_vars includes all three documented vars", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
    await cmdAgentContext();
    const parsed = JSON.parse(logs[0]!) as { env_vars: Record<string, string> };
    expect(parsed.env_vars["FRAPPE_CTL_READONLY"]).toBeTruthy();
    expect(parsed.env_vars["FRAPPE_CTL_CONFIG_DIR"]).toBeTruthy();
    expect(parsed.env_vars["FRAPPE_CTL_NO_KEYCHAIN"]).toBeTruthy();
  });

  it("auth_commands lists login/logout/status", async () => {
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));
    await cmdAgentContext();
    const parsed = JSON.parse(logs[0]!) as { auth_commands: string[] };
    const cmds = parsed.auth_commands.join(" ");
    expect(cmds).toContain("login");
    expect(cmds).toContain("logout");
    expect(cmds).toContain("status");
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
