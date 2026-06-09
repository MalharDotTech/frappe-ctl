import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdBulk } from "./bulk.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(...responses: unknown[]) {
  let spy = spyOn(globalThis, "fetch");
  for (const body of responses) {
    spy = spy.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
  }
  return spy;
}

// list response (names only)
const listPage1 = { data: [{ name: "SO-001" }, { name: "SO-002" }, { name: "SO-003" }] };
const listEmpty  = { data: [] };
const updateOk   = { data: { name: "SO-001", status: "On Hold" } };

describe("cmdBulk", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("rejects when no filters provided", async () => {
    await expect(
      cmdBulk(client, { subVerb: "patch", doctype: "SalesOrder", filters: [], data: {}, force: false }),
    ).rejects.toThrow(/filter/i);
  });

  it("rejects unknown sub-verb", async () => {
    await expect(
      cmdBulk(client, { subVerb: "submit" as "patch", doctype: "SalesOrder", filters: [["status", "=", "Draft"]], data: {}, force: false }),
    ).rejects.toThrow(/patch.*delete/i);
  });

  it("dry-run lists affected docs without writing", async () => {
    // list page 1 returns 3, page 2 empty → done
    mockFetch(listPage1, listEmpty);
    const { lines, restore } = captureOutput();

    await cmdBulk(client, {
      subVerb: "patch",
      doctype: "SalesOrder",
      filters: [["status", "=", "Draft"]],
      data: { status: "On Hold" },
      force: false,
      dryRun: true,
    });
    restore();

    const out = lines.join("\n");
    expect(out).toContain("[DRY RUN]");
    expect(out).toContain("3");         // count
    expect(out).toContain("SO-001");
  });

  it("bulk patch sends PUT for each doc", async () => {
    // 2 docs < PAGE(100) → listAll done in 1 call; then 2 PUTs
    const list2 = { data: [{ name: "SO-001" }, { name: "SO-002" }] };
    mockFetch(list2, updateOk, updateOk);
    const { lines, restore } = captureOutput();

    await cmdBulk(client, {
      subVerb: "patch",
      doctype: "SalesOrder",
      filters: [["status", "=", "Draft"]],
      data: { status: "On Hold" },
      force: false,
    });

    restore();
    const result = JSON.parse(lines[lines.length - 1]!) as { success: number; failed: number };
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("bulk delete requires --force", async () => {
    await expect(
      cmdBulk(client, {
        subVerb: "delete",
        doctype: "SalesOrder",
        filters: [["status", "=", "Cancelled"]],
        data: {},
        force: false,
      }),
    ).rejects.toThrow(/--force/i);
  });

  it("bulk delete with --force sends DELETE for each doc", async () => {
    const list2 = { data: [{ name: "SO-001" }, { name: "SO-002" }] };
    const deleteOk = "ok";
    mockFetch(list2, deleteOk, deleteOk);
    const { lines, restore } = captureOutput();

    await cmdBulk(client, {
      subVerb: "delete",
      doctype: "SalesOrder",
      filters: [["status", "=", "Cancelled"]],
      data: {},
      force: true,
    });

    restore();
    const result = JSON.parse(lines[lines.length - 1]!) as { success: number };
    expect(result.success).toBe(2);
  });

  it("records partial failures without throwing", async () => {
    const list2 = { data: [{ name: "SO-001" }, { name: "SO-002" }] };
    const failResponse = new Response(JSON.stringify({ exc_type: "ValidationError" }), { status: 417 });
    // 2 docs < PAGE(100) so listAll stops after one list call — no empty page needed
    const spy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(list2), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updateOk), { status: 200 }))
      .mockResolvedValueOnce(failResponse);
    void spy;

    const { lines, restore } = captureOutput();

    await cmdBulk(client, {
      subVerb: "patch",
      doctype: "SalesOrder",
      filters: [["status", "=", "Draft"]],
      data: { status: "On Hold" },
      force: false,
    });

    restore();
    const result = JSON.parse(lines[lines.length - 1]!) as { success: number; failed: number };
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("outputs valid JSON result", async () => {
    const list1 = { data: [{ name: "SO-001" }] };
    mockFetch(list1, updateOk);
    const { lines, restore } = captureOutput();

    await cmdBulk(client, {
      subVerb: "patch",
      doctype: "SalesOrder",
      filters: [["status", "=", "Draft"]],
      data: { status: "On Hold" },
      force: false,
    });

    restore();
    const result = JSON.parse(lines[lines.length - 1]!) as { total: number; success: number; failed: number; errors: unknown[] };
    expect(result.total).toBe(1);
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
