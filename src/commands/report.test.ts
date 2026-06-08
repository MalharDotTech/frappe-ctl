import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdReport } from "./report.ts";
import { reportResponse } from "../__fixtures__/api-responses.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdReport", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("calls frappe.desk.query_report.run", async () => {
    const spy = mockFetch(reportResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdReport(client, { reportName: "Project Billing Summary", filters: {}, format: "json" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("frappe.desk.query_report.run");
  });

  it("sends report_name in request body", async () => {
    const spy = mockFetch(reportResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdReport(client, { reportName: "Project Billing Summary", filters: {}, format: "json" });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    expect(body["report_name"]).toBe("Project Billing Summary");
  });

  it("passes filters to the report", async () => {
    const spy = mockFetch(reportResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdReport(client, {
      reportName: "Project Billing Summary",
      filters: { company: "Cloud Shaped Dreams Studio" },
      format: "json",
    });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    const filters = body["filters"] as Record<string, unknown>;
    expect(filters["company"]).toBe("Cloud Shaped Dreams Studio");
  });

  it("sets ignore_prepared_report=1 — avoids stale cached reports", async () => {
    const spy = mockFetch(reportResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdReport(client, { reportName: "Project Billing Summary", filters: {}, format: "json" });

    const [, options] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse((options as RequestInit).body as string) as Record<string, unknown>;
    expect(body["ignore_prepared_report"]).toBe(1);
  });

  it("table format uses column labels as headers", async () => {
    mockFetch(reportResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdReport(client, { reportName: "Project Billing Summary", filters: {}, format: "table" });

    const output = logs.join("\n");
    expect(output).toContain("Project");
    expect(output).toContain("Customer");
    expect(output).toContain("Billed Amount");
  });

  it("table format includes row data", async () => {
    mockFetch(reportResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdReport(client, { reportName: "Project Billing Summary", filters: {}, format: "table" });

    const output = logs.join("\n");
    expect(output).toContain("Magic Peacock Studio");
    expect(output).toContain("14000");
  });

  it("json format returns columns + result", async () => {
    mockFetch(reportResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdReport(client, { reportName: "Project Billing Summary", filters: {}, format: "json" });

    const result = JSON.parse(logs[0]!) as { columns: unknown[]; result: unknown[][] };
    expect(result.columns).toHaveLength(3);
    expect(result.result).toHaveLength(2);
  });
});
