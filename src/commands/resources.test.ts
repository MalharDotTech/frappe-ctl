import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdResources } from "./resources.ts";
import { resourcesResponse } from "../__fixtures__/api-responses.ts";
import { APPS } from "../apps.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdResources", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("queries via frappe.client.get_list POST (resources = DocTypes in Frappe vocab)", async () => {
    const spy = mockFetch(resourcesResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdResources(client, { appAlias: "next", format: "json" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("/api/method/frappe.client.get_list");
  });

  it("filters by app modules in POST body so only relevant DocTypes appear", async () => {
    const spy = mockFetch(resourcesResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdResources(client, { appAlias: "next", format: "json" });

    const [, opts] = spy.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(opts.body) as Record<string, unknown>;
    // filters in POST body should include at least one ERPNext module
    expect(JSON.stringify(body.filters)).toContain("Selling");
  });

  it("table format shows NAME, MODULE, SUBMITTABLE columns", async () => {
    mockFetch(resourcesResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdResources(client, { appAlias: "next", format: "table" });

    const output = logs.join("\n");
    expect(output).toContain("NAME");
    expect(output).toContain("MODULE");
    expect(output).toContain("SUBMIT");
  });

  it("table marks submittable DocTypes clearly", async () => {
    mockFetch(resourcesResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdResources(client, { appAlias: "next", format: "table" });

    const output = logs.join("\n");
    // Sales Order is_submittable=1
    const soLine = output.split("\n").find((l) => l.includes("Sales Order"));
    expect(soLine).toContain("yes");
    // Customer is_submittable=0
    const custLine = output.split("\n").find((l) => l.includes("Customer"));
    expect(custLine).toContain("no");
  });

  it("json format returns raw DocType list", async () => {
    mockFetch(resourcesResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdResources(client, { appAlias: "next", format: "json" });

    const result = JSON.parse(logs[0]!) as unknown[];
    expect(result).toHaveLength(4);
  });

  it("every app in registry has at least one module — resources would be empty otherwise", () => {
    for (const [alias, app] of Object.entries(APPS)) {
      expect(app.modules.length).toBeGreaterThan(0, `${alias} needs at least one module`);
    }
  });
});
