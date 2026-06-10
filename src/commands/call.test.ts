import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdCall } from "./call.ts";
import { callMethodResponse } from "../__fixtures__/api-responses.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdCall", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("POSTs to /api/method/{method}", async () => {
    const spy = mockFetch(callMethodResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCall(client, { method: "frappe.client.get_list", data: { doctype: "Sales Order" }, format: "json" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("/api/method/frappe.client.get_list");
  });

  it("passes data fields in request body", async () => {
    const spy = mockFetch(callMethodResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdCall(client, {
      method: "frappe.client.get_list",
      data: { doctype: "Sales Order", limit_page_length: 5 },
      format: "json",
    });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    expect(body["doctype"]).toBe("Sales Order");
    expect(body["limit_page_length"]).toBe(5);
  });

  it("works without data (empty call)", async () => {
    mockFetch({ message: "pong" });
    const { lines, restore } = captureOutput();

    await cmdCall(client, { method: "frappe.ping", format: "json" });
    restore();

    expect(lines[0]).toContain("pong");
  });

  it("outputs raw method response as JSON", async () => {
    mockFetch(callMethodResponse);
    const { lines, restore } = captureOutput();

    await cmdCall(client, { method: "frappe.client.get_list", data: { doctype: "Sales Order" }, format: "json" });
    restore();

    const result = JSON.parse(lines[0]!) as unknown[];
    expect(Array.isArray(result)).toBe(true);
    expect((result[0] as Record<string, unknown>)["name"]).toBe("SO-2024-00001");
  });

  it("method name is passed exactly — dotted path must be preserved", async () => {
    const spy = mockFetch({ message: "ok" });
    spyOn(console, "log").mockImplementation(() => {});

    const method = "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry";
    await cmdCall(client, { method, format: "json" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain(method);
  });

  it("--wait polls job and outputs final result when response has job_name", async () => {
    mockFetch({ message: { job_name: "job-abc", status: "queued" } });
    const waitSpy = spyOn(client, "waitForJob").mockResolvedValueOnce({
      status: "finished",
      result: { name: "STOCK-0001" },
    });
    const { lines, restore } = captureOutput();
    spyOn(console, "error").mockImplementation(() => {});

    await cmdCall(client, { method: "some.async.method", format: "json", wait: true });
    restore();

    expect(waitSpy).toHaveBeenCalledWith("job-abc");
    const out = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(out["name"]).toBe("STOCK-0001");
    waitSpy.mockRestore();
  });

  it("--wait throws when job fails", async () => {
    mockFetch({ message: { job_name: "job-fail", status: "queued" } });
    const waitSpy = spyOn(client, "waitForJob").mockResolvedValueOnce({
      status: "failed",
      exc_info: "ValueError: bad data",
    });
    spyOn(console, "error").mockImplementation(() => {});

    try {
      await cmdCall(client, { method: "some.async.method", format: "json", wait: true });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("Job failed");
    } finally {
      waitSpy.mockRestore();
    }
  });

  it("--wait ignored when response has no job_name — only 1 fetch call made", async () => {
    const fetchSpy = mockFetch({ message: { some: "data" } });
    const { lines, restore } = captureOutput();

    await cmdCall(client, { method: "some.sync.method", format: "json", wait: true });
    restore();

    expect(fetchSpy.mock.calls.length).toBe(1);
    expect(lines[0]).toContain("some");
  });
});
