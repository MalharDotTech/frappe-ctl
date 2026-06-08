import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdCreate, cmdPatch, cmdDelete } from "./write.ts";
import { createResponse, updateResponse } from "../__fixtures__/api-responses.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

// ── create ────────────────────────────────────────────────────────────────────

describe("cmdCreate", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("POSTs to /api/resource/{DocType}", async () => {
    const spy = mockFetch(createResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCreate(client, { doctype: "Sales Order", data: { customer: "Magic Peacock Studio" }, format: "json" });

    const [url, options] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/resource/Sales%20Order");
    expect((options as RequestInit).method).toBe("POST");
  });

  it("sends data fields in the request body", async () => {
    const spy = mockFetch(createResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCreate(client, {
      doctype: "Sales Order",
      data: { customer: "Magic Peacock Studio", grand_total: 14000 },
      format: "json",
    });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    expect(body["customer"]).toBe("Magic Peacock Studio");
    expect(body["grand_total"]).toBe(14000);
  });

  it("outputs the created doc", async () => {
    mockFetch(createResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdCreate(client, { doctype: "Sales Order", data: {}, format: "json" });

    const doc = JSON.parse(logs[0]!) as Record<string, unknown>;
    expect(doc["name"]).toBe("SO-2024-00001");
  });
});

// ── patch ─────────────────────────────────────────────────────────────────────

describe("cmdPatch", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("PUTs to /api/resource/{DocType}/{name}", async () => {
    const spy = mockFetch(updateResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdPatch(client, {
      doctype: "Sales Order",
      name: "SO-2024-00001",
      data: { status: "On Hold" },
      format: "json",
    });

    const [url, options] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/resource/Sales%20Order/SO-2024-00001");
    expect((options as RequestInit).method).toBe("PUT");
  });

  it("outputs updated doc", async () => {
    mockFetch(updateResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdPatch(client, {
      doctype: "Sales Order",
      name: "SO-2024-00001",
      data: { status: "On Hold" },
      format: "json",
    });

    const doc = JSON.parse(logs[0]!) as Record<string, unknown>;
    expect(doc["status"]).toBe("On Hold");
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe("cmdDelete", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("DELETEs /api/resource/{DocType}/{name} with --force", async () => {
    const spy = mockFetch({});
    spyOn(console, "log").mockImplementation(() => {});

    await cmdDelete(client, { doctype: "Sales Order", name: "SO-2024-00001", force: true });

    const [url, options] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/resource/Sales%20Order/SO-2024-00001");
    expect((options as RequestInit).method).toBe("DELETE");
  });

  it("prints confirmation after successful delete", async () => {
    mockFetch({});
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDelete(client, { doctype: "Sales Order", name: "SO-2024-00001", force: true });

    expect(logs.join(" ")).toContain("SO-2024-00001");
  });

  it("throws without --force flag (requires confirmation)", async () => {
    // No fetch mock needed — should throw before hitting network
    expect(
      cmdDelete(client, { doctype: "Sales Order", name: "SO-2024-00001", force: false }),
    ).rejects.toThrow("--force");
  });
});
