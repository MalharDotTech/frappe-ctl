import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdLogs } from "./logs.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

const logsResponse = {
  data: [
    { name: "ERR-001", method: "frappe.desk.form.save.savedocs", error: "ValidationError: ...", creation: "2026-06-09 10:00:00" },
    { name: "ERR-002", method: "frappe.client.submit", error: "PermissionError: ...", creation: "2026-06-09 09:00:00" },
  ],
};

describe("cmdLogs", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("fetches from Error Log doctype", async () => {
    const spy = mockFetch(logsResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdLogs(client, {});

    const [url] = spy.mock.calls[0] as [string];
    expect(decodeURIComponent(url)).toContain("Error Log");
  });

  it("default limit is 20", async () => {
    const spy = mockFetch(logsResponse);
    spyOn(console, "log").mockImplementation(() => {});

    // noDefaultExclude: true disables the 3x pre-filter multiplier — isolates limit param
    await cmdLogs(client, { noDefaultExclude: true });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("limit_page_length=20");
  });

  it("multiplies fetch limit when default excludes are active", async () => {
    const spy = mockFetch(logsResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdLogs(client, { limit: 5 });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("limit_page_length=15"); // 5 * 3
  });

  it("respects custom limit with no excludes", async () => {
    const spy = mockFetch(logsResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdLogs(client, { limit: 5, noDefaultExclude: true });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("limit_page_length=5");
  });

  it("table format shows method and creation columns", async () => {
    mockFetch(logsResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdLogs(client, { format: "table" });

    const out = logs.join("\n");
    expect(out).toContain("METHOD");
    expect(out).toContain("frappe.desk.form.save.savedocs");
  });

  it("json format returns raw array", async () => {
    mockFetch(logsResponse);
    const { lines, restore } = captureOutput();

    await cmdLogs(client, { format: "json", noDefaultExclude: true });
    restore();

    const parsed = JSON.parse(lines[0]!) as unknown[];
    expect(parsed).toHaveLength(2);
  });

  it("filters by method substring when --filter passed", async () => {
    const spy = mockFetch(logsResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdLogs(client, { method: "submit" });

    const [url] = spy.mock.calls[0] as [string];
    expect(decodeURIComponent(url)).toContain("submit");
  });
});
