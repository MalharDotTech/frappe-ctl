import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdCount } from "./count.ts";
import { countResponse } from "../__fixtures__/api-responses.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdCount", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("POSTs to frappe.client.get_count", async () => {
    const spy = mockFetch(countResponse);
    const { restore } = captureOutput();

    await cmdCount(client, { doctype: "Sales Order" });
    restore();

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("/api/method/frappe.client.get_count");
  });

  it("sends doctype in POST body", async () => {
    const spy = mockFetch(countResponse);
    const { restore } = captureOutput();

    await cmdCount(client, { doctype: "Sales Order" });
    restore();

    const [, opts] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body["doctype"]).toBe("Sales Order");
  });

  it("outputs plain integer to stdout", async () => {
    mockFetch(countResponse);
    const { lines, restore } = captureOutput();

    await cmdCount(client, { doctype: "Sales Order" });
    restore();

    expect(lines[0]).toBe("42");
  });

  it("sends filters when provided", async () => {
    const spy = mockFetch(countResponse);
    const { restore } = captureOutput();

    await cmdCount(client, {
      doctype: "Sales Order",
      filters: [["status", "=", "Open"]],
    });
    restore();

    const [, opts] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(JSON.stringify(body["filters"])).toContain("Open");
  });
});
