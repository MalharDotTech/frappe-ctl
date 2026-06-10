import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdDescribe } from "./describe.ts";
import { doctypeMetaResponse } from "../__fixtures__/api-responses.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdDescribe", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("calls getDocTypeMeta with the correct doctype", async () => {
    const spy = mockFetch({ message: doctypeMetaResponse });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDescribe(client, { doctype: "Sales Order", format: "json" });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["name"]).toBe("Sales Order");
  });

  it("outputs all fields from the doctype meta", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const { lines, restore } = captureOutput();

    await cmdDescribe(client, { doctype: "Sales Order", format: "json" });
    restore();

    const output = JSON.parse(lines[0]!) as { name: string; fields: unknown[] };
    expect(output.name).toBe("Sales Order");
    expect(output.fields).toHaveLength(5);
  });

  it("table format shows fieldname, fieldtype, label, reqd columns", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDescribe(client, { doctype: "Sales Order", format: "table" });

    const output = logs.join("\n");
    expect(output).toContain("customer");
    expect(output).toContain("Link");
    expect(output).toContain("yes");
  });

  it("marks required fields clearly in table", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdDescribe(client, { doctype: "Sales Order", format: "table" });

    const output = logs.join("\n");
    const customerLine = output.split("\n").find((l) => l.includes("customer"));
    expect(customerLine).toContain("yes");
    const deliveryLine = output.split("\n").find((l) => l.includes("delivery_date"));
    expect(deliveryLine).toContain("no");
  });

  it("--required in JSON mode returns only reqd fields, not all fields", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const { lines, restore } = captureOutput();

    await cmdDescribe(client, { doctype: "Sales Order", format: "json", required: true });
    restore();

    // doctypeMetaResponse has 2 reqd fields: customer and transaction_date
    const output = JSON.parse(lines[0]!) as { fields: { fieldname: string; reqd: number }[] };
    expect(output.fields.every((f) => f.reqd === 1)).toBe(true);
    expect(output.fields.length).toBe(2);
    expect(output.fields.map((f) => f.fieldname)).toContain("customer");
    expect(output.fields.map((f) => f.fieldname)).toContain("transaction_date");
  });

  it("--relationships in JSON mode returns only Link/Table fields", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const { lines, restore } = captureOutput();

    await cmdDescribe(client, { doctype: "Sales Order", format: "json", relationships: true });
    restore();

    // doctypeMetaResponse has 1 Link field: customer
    const output = JSON.parse(lines[0]!) as { fieldname: string; fieldtype: string }[];
    expect(Array.isArray(output)).toBe(true);
    expect(output.every((f) => f.fieldtype === "Link" || f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect")).toBe(true);
    expect(output.map((f) => f.fieldname)).toContain("customer");
  });
});
