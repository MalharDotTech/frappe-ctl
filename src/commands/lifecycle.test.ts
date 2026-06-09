import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdSubmit, cmdCancel } from "./lifecycle.ts";
import { salesOrderDocResponse, submitResponse, cancelResponse } from "../__fixtures__/api-responses.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

// submit/cancel now do two HTTP calls: GET (full doc) then POST (method)
function mockTwo(first: unknown, second: unknown) {
  return spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(second), { status: 200 }));
}

// ── submit ────────────────────────────────────────────────────────────────────

describe("cmdSubmit", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("fetches full doc then calls frappe.client.submit", async () => {
    const spy = mockTwo(salesOrderDocResponse, submitResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdSubmit(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    // call[0] = GET /api/resource/... (getDoc)
    // call[1] = POST frappe.client.submit
    const [getUrl] = spy.mock.calls[0] as [string];
    const [submitUrl] = spy.mock.calls[1] as [string];
    expect(getUrl).toContain("/api/resource/Sales%20Order/SO-2024-00001");
    expect(submitUrl).toContain("frappe.client.submit");
  });

  it("passes full doc object in submit body (not just doctype+name)", async () => {
    const spy = mockTwo(salesOrderDocResponse, submitResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdSubmit(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    const [, opts] = spy.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { doc: Record<string, unknown> };
    // Full doc must be passed — Frappe rejects {doctype,name} only (returns 417)
    expect(body.doc["doctype"]).toBe("Sales Order");
    expect(body.doc["name"]).toBe("SO-2024-00001");
    expect(body.doc["docstatus"]).toBe(0);  // full doc includes docstatus
    expect(body.doc["grand_total"]).toBe(14000);
  });

  it("prints submitted docstatus in output", async () => {
    mockTwo(salesOrderDocResponse, submitResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdSubmit(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    expect(logs.join(" ")).toContain("SO-2024-00001");
    expect(logs.join(" ")).toContain("1");
  });

  it("dry-run prints intent without any HTTP calls", async () => {
    const spy = spyOn(globalThis, "fetch");
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdSubmit(client, { doctype: "Sales Order", name: "SO-2024-00001", dryRun: true });

    expect(spy).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("DRY RUN");
  });
});

// ── cancel ────────────────────────────────────────────────────────────────────

describe("cmdCancel", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("fetches full doc then calls frappe.client.cancel", async () => {
    const spy = mockTwo(salesOrderDocResponse, cancelResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCancel(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    const [getUrl] = spy.mock.calls[0] as [string];
    const [cancelUrl] = spy.mock.calls[1] as [string];
    expect(getUrl).toContain("/api/resource/Sales%20Order/SO-2024-00001");
    expect(cancelUrl).toContain("frappe.client.cancel");
  });

  it("passes full doc in cancel body", async () => {
    const spy = mockTwo(salesOrderDocResponse, cancelResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCancel(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    const [, opts] = spy.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as { doc: Record<string, unknown> };
    expect(body.doc["doctype"]).toBe("Sales Order");
    expect(body.doc["name"]).toBe("SO-2024-00001");
  });

  it("prints cancelled docstatus in output", async () => {
    mockTwo(salesOrderDocResponse, cancelResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdCancel(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    expect(logs.join(" ")).toContain("SO-2024-00001");
    expect(logs.join(" ")).toContain("2");
  });

  it("dry-run prints intent without any HTTP calls", async () => {
    const spy = spyOn(globalThis, "fetch");
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdCancel(client, { doctype: "Sales Order", name: "SO-2024-00001", dryRun: true });

    expect(spy).not.toHaveBeenCalled();
    expect(logs.join(" ")).toContain("DRY RUN");
  });
});
