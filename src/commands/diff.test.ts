import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdDiff } from "./diff.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

const projectDocResponse = {
  data: { name: "PROJ-0005", status: "Open", custom_sanction_amount: 15000, customer: "Magic Peacock Studio" },
};

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdDiff", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("shows changed fields between current doc and proposed data", async () => {
    mockFetch(projectDocResponse);
    const { lines, restore } = captureOutput();

    await cmdDiff(client, {
      doctype: "Project",
      name: "PROJ-0005",
      data: { status: "Completed", custom_sanction_amount: 18000 },
    });
    restore();

    const output = lines.join("\n");
    expect(output).toContain("status");
    expect(output).toContain("Open");
    expect(output).toContain("Completed");
    expect(output).toContain("custom_sanction_amount");
    expect(output).toContain("15000");
    expect(output).toContain("18000");
  });

  it("shows 'No changes.' when proposed matches current", async () => {
    mockFetch(projectDocResponse);
    const { lines, restore } = captureOutput();

    await cmdDiff(client, {
      doctype: "Project",
      name: "PROJ-0005",
      data: { status: "Open" }, // same as current
    });
    restore();

    expect(lines[0]).toBe("No changes.");
  });

  it("only shows fields that differ, not unchanged ones", async () => {
    mockFetch(projectDocResponse);
    const { lines, restore } = captureOutput();

    await cmdDiff(client, {
      doctype: "Project",
      name: "PROJ-0005",
      data: { status: "Completed", customer: "Magic Peacock Studio" }, // customer unchanged
    });
    restore();

    const output = lines.join("\n");
    expect(output).toContain("status");
    // customer matches — should not appear in diff
    const customerMentions = lines.filter((l) => l.includes("customer")).length;
    expect(customerMentions).toBe(0);
  });

  it("fetches doc via GET /api/resource", async () => {
    const spy = mockFetch(projectDocResponse);
    const { restore } = captureOutput();

    await cmdDiff(client, { doctype: "Project", name: "PROJ-0005", data: { status: "Completed" } });
    restore();

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("/api/resource/Project/PROJ-0005");
  });
});
