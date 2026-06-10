import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdSearch } from "./search.ts";
import { salesOrderListResponse, doctypeMetaResponse } from "../__fixtures__/api-responses.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdSearch", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("uses --field directly without fetching meta", async () => {
    const spy = mockFetch(salesOrderListResponse);
    const { restore } = captureOutput();

    await cmdSearch(client, { doctype: "Sales Order", query: "Magic", field: "customer" });
    restore();

    expect(spy.mock.calls).toHaveLength(1);
    const [url] = spy.mock.calls[0] as [string];
    // should be a listDocs GET, not meta POST
    expect(url).toContain("/api/resource/Sales%20Order");
    expect(url).toContain("like");
  });

  it("builds %query% like filter on specified field", async () => {
    const spy = mockFetch(salesOrderListResponse);
    const { restore } = captureOutput();

    await cmdSearch(client, { doctype: "Sales Order", query: "Magic", field: "customer" });
    restore();

    const [url] = spy.mock.calls[0] as [string];
    expect(decodeURIComponent(url)).toContain("%Magic%");
  });

  it("fetches meta first when no --field to determine title_field (2 HTTP calls)", async () => {
    // meta fetch + list fetch
    const spy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: doctypeMetaResponse }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(salesOrderListResponse), { status: 200 }));

    const { restore } = captureOutput();
    await cmdSearch(client, { doctype: "Sales Order", query: "Magic" });
    restore();

    expect(spy.mock.calls).toHaveLength(2);
  });

  it("outputs docs as JSON when piped", async () => {
    mockFetch(salesOrderListResponse);
    const { lines, restore } = captureOutput();

    await cmdSearch(client, { doctype: "Sales Order", query: "Magic", field: "customer", format: "json" });
    restore();

    const result = JSON.parse(lines[0]!) as unknown[];
    expect(result).toHaveLength(1);
  });

  it("--sparse strips null/empty fields from results", async () => {
    const docsWithNulls = {
      data: [{ name: "SO-001", customer: "Magic Peacock", status: "", grand_total: 0, project: null }],
    };
    mockFetch(docsWithNulls);
    const { lines, restore } = captureOutput();

    await cmdSearch(client, { doctype: "Sales Order", query: "Magic", field: "customer", format: "json", sparse: true });
    restore();

    const result = JSON.parse(lines[0]!) as Record<string, unknown>[];
    expect(result[0]).not.toHaveProperty("status");
    expect(result[0]).not.toHaveProperty("project");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("customer");
  });
});
