import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdDescribe } from "./describe.ts";
import { doctypeMetaResponse } from "../__fixtures__/api-responses.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

// getDocTypeMeta now uses listDocs("DocField") — GET /api/resource/DocField?filters=...
// Response shape is { data: fields[] }, not { message: { name, fields } }
function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdDescribe", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("queries DocField table with doctype filter", async () => {
    const spy = mockFetch({ data: doctypeMetaResponse.fields });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDescribe(client, { doctype: "Sales Order", format: "json" });

    const [url] = spy.mock.calls[0] as [string];
    const decoded = decodeURIComponent(url).replace(/\+/g, " ");
    expect(decoded).toContain("DocField");
    expect(decoded).toContain("Sales Order");
  });

  it("outputs all fields from the doctype meta", async () => {
    mockFetch({ data: doctypeMetaResponse.fields });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDescribe(client, { doctype: "Sales Order", format: "json" });

    const output = JSON.parse(logs[0]!) as { name: string; fields: unknown[] };
    expect(output.name).toBe("Sales Order");
    expect(output.fields).toHaveLength(5);
  });

  it("table format shows fieldname, fieldtype, label, reqd columns", async () => {
    mockFetch({ data: doctypeMetaResponse.fields });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDescribe(client, { doctype: "Sales Order", format: "table" });

    const output = logs.join("\n");
    expect(output).toContain("customer");
    expect(output).toContain("Link");
    expect(output).toContain("yes"); // reqd=1 shown as yes
  });

  it("marks required fields clearly in table", async () => {
    mockFetch({ data: doctypeMetaResponse.fields });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDescribe(client, { doctype: "Sales Order", format: "table" });

    const output = logs.join("\n");
    // customer and transaction_date are reqd=1
    const customerLine = output.split("\n").find((l) => l.includes("customer"));
    expect(customerLine).toContain("yes");
    // delivery_date is reqd=0
    const deliveryLine = output.split("\n").find((l) => l.includes("delivery_date"));
    expect(deliveryLine).toContain("no");
  });
});
