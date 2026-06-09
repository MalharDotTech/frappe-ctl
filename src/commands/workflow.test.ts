import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdWorkflow } from "./workflow.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

const workflowResponse = {
  message: { name: "SO-001", doctype: "Sales Order", workflow_state: "Approved" },
};

describe("cmdWorkflow", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("calls frappe.model.workflow.apply_workflow method", async () => {
    const spy = mockFetch(workflowResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdWorkflow(client, { doctype: "Sales Order", name: "SO-001", action: "Approve" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("frappe.model.workflow.apply_workflow");
  });

  it("sends doctype, name, action in body", async () => {
    const spy = mockFetch(workflowResponse);
    spyOn(console, "log").mockImplementation(() => {});

    await cmdWorkflow(client, { doctype: "Sales Order", name: "SO-001", action: "Approve" });

    const [, opts] = spy.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(opts.body) as Record<string, unknown>;
    expect((body["doc"] as Record<string, unknown>)["doctype"]).toBe("Sales Order");
    expect((body["doc"] as Record<string, unknown>)["name"]).toBe("SO-001");
    expect(body["action"]).toBe("Approve");
  });

  it("prints workflow_state after transition", async () => {
    mockFetch(workflowResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdWorkflow(client, { doctype: "Sales Order", name: "SO-001", action: "Approve" });

    expect(logs.join("\n")).toContain("Approved");
  });

  it("dry-run prints intent without HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdWorkflow(client, { doctype: "Sales Order", name: "SO-001", action: "Approve", dryRun: true });

    expect(spy).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[DRY RUN]");
    expect(logs.join("\n")).toContain("Approve");
  });
});
