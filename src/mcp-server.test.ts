import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "./client.ts";
import { getMcpTools, callMcpTool, handleMcpRequest } from "./mcp-server.ts";
import { doctypeMetaResponse } from "./__fixtures__/api-responses.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("getMcpTools", () => {
  it("returns only read-only tools when allowMutations=false", () => {
    const tools = getMcpTools(false);
    const names = tools.map((t) => t.name);
    expect(names).toContain("frappe_get");
    expect(names).toContain("frappe_count");
    expect(names).toContain("frappe_search");
    expect(names).toContain("frappe_describe");
    expect(names).toContain("frappe_validate");
    expect(names).not.toContain("frappe_create");
    expect(names).not.toContain("frappe_patch");
    expect(names).not.toContain("frappe_delete");
  });

  it("includes mutation tools when allowMutations=true", () => {
    const tools = getMcpTools(true);
    const names = tools.map((t) => t.name);
    expect(names).toContain("frappe_create");
    expect(names).toContain("frappe_patch");
    expect(names).toContain("frappe_delete");
  });

  it("every tool has name, description, and inputSchema", () => {
    for (const tool of getMcpTools(true)) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

describe("callMcpTool", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("frappe_get fetches single doc by name", async () => {
    mockFetch({ data: { name: "CUST-001", customer_name: "Acme" } });

    const result = await callMcpTool(client, "frappe_get", { doctype: "Customer", name: "CUST-001" }, false);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("CUST-001");
  });

  it("frappe_get lists docs when no name given", async () => {
    mockFetch({ data: [{ name: "CUST-001" }, { name: "CUST-002" }] });

    const result = await callMcpTool(client, "frappe_get", { doctype: "Customer" }, false);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });

  it("frappe_count returns integer", async () => {
    mockFetch({ message: 42 });

    const result = await callMcpTool(client, "frappe_count", { doctype: "Sales Order" }, false);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toBe("42");
  });

  it("frappe_describe returns schema fields", async () => {
    mockFetch({ message: doctypeMetaResponse });

    const result = await callMcpTool(client, "frappe_describe", { doctype: "Sales Order" }, false);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as { name: string; fields: unknown[] };
    expect(parsed.name).toBe("Sales Order");
    expect(Array.isArray(parsed.fields)).toBe(true);
  });

  it("frappe_validate returns valid:true when all required fields present", async () => {
    mockFetch({ message: doctypeMetaResponse });

    const result = await callMcpTool(client, "frappe_validate", {
      doctype: "Sales Order",
      data: { customer: "Acme", transaction_date: "2026-06-11" },
    }, false);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as { valid: boolean };
    expect(parsed.valid).toBe(true);
  });

  it("frappe_validate returns valid:false with missing fields", async () => {
    mockFetch({ message: doctypeMetaResponse });

    const result = await callMcpTool(client, "frappe_validate", {
      doctype: "Sales Order",
      data: { customer: "Acme" }, // missing transaction_date
    }, false);

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as { valid: boolean; missing: string[] };
    expect(parsed.valid).toBe(false);
    expect(parsed.missing).toContain("transaction_date");
  });

  it("blocks frappe_create when allowMutations=false", async () => {
    const result = await callMcpTool(client, "frappe_create", {
      doctype: "Customer",
      data: { customer_name: "Acme" },
    }, false);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("mutation");
  });

  it("frappe_create creates doc when allowMutations=true", async () => {
    mockFetch({ data: { name: "CUST-999", customer_name: "Acme" } });

    const result = await callMcpTool(client, "frappe_create", {
      doctype: "Customer",
      data: { customer_name: "Acme", customer_type: "Company" },
    }, true);

    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain("CUST-999");
  });

  it("frappe_delete requires force=true", async () => {
    const result = await callMcpTool(client, "frappe_delete", {
      doctype: "Customer",
      name: "CUST-001",
      force: false,
    }, true);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("force");
  });

  it("returns isError=true and text on unknown tool", async () => {
    const result = await callMcpTool(client, "nonexistent_tool", {}, false);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("nonexistent_tool");
  });
});

describe("handleMcpRequest", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("initialize returns server info", async () => {
    const res = await handleMcpRequest(client, {
      jsonrpc: "2.0", id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }, false);

    expect(res?.result?.serverInfo?.name).toBe("frappe-ctl");
    expect(res?.result?.capabilities?.tools).toBeDefined();
  });

  it("tools/list returns tool array", async () => {
    const res = await handleMcpRequest(client, {
      jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
    }, false);

    expect(Array.isArray(res?.result?.tools)).toBe(true);
    expect(res?.result?.tools?.length).toBeGreaterThan(0);
  });

  it("tools/call dispatches to tool and returns content", async () => {
    mockFetch({ message: 7 });

    const res = await handleMcpRequest(client, {
      jsonrpc: "2.0", id: 3,
      method: "tools/call",
      params: { name: "frappe_count", arguments: { doctype: "Customer" } },
    }, false);

    expect(res?.result?.content?.[0]?.text).toBe("7");
  });

  it("notifications/initialized returns null (no response)", async () => {
    const res = await handleMcpRequest(client, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }, false);

    expect(res).toBeNull();
  });

  it("unknown method returns JSON-RPC error", async () => {
    const res = await handleMcpRequest(client, {
      jsonrpc: "2.0", id: 99, method: "unknown/method", params: {},
    }, false);

    expect(res?.error).toBeDefined();
    expect(res?.error?.code).toBe(-32601);
  });
});
