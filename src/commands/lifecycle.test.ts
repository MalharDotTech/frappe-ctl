import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdSubmit, cmdCancel } from "./lifecycle.ts";
import { submitResponse, cancelResponse } from "../__fixtures__/api-responses.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

// ── submit ────────────────────────────────────────────────────────────────────

describe("cmdSubmit", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("calls frappe.client.submit method", async () => {
    const spy = mockFetch(submitResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdSubmit(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("frappe.client.submit");
  });

  it("sends doctype and name in the body", async () => {
    const spy = mockFetch(submitResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdSubmit(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    const doc = body["doc"] as Record<string, unknown>;
    expect(doc["doctype"]).toBe("Sales Order");
    expect(doc["name"]).toBe("SO-2024-00001");
  });

  it("confirms submission with docstatus in output", async () => {
    mockFetch(submitResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdSubmit(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    expect(logs.join(" ")).toContain("SO-2024-00001");
  });
});

// ── cancel ────────────────────────────────────────────────────────────────────

describe("cmdCancel", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("calls frappe.client.cancel method", async () => {
    const spy = mockFetch(cancelResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCancel(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("frappe.client.cancel");
  });

  it("sends doctype and name in the body", async () => {
    const spy = mockFetch(cancelResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCancel(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    expect(body["doctype"]).toBe("Sales Order");
    expect(body["name"]).toBe("SO-2024-00001");
  });

  it("confirms cancellation in output", async () => {
    mockFetch(cancelResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdCancel(client, { doctype: "Sales Order", name: "SO-2024-00001" });

    expect(logs.join(" ")).toContain("SO-2024-00001");
  });
});
