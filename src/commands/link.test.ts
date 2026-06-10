import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdLink } from "./link.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

const soDocResponse = {
  data: { name: "SO-001", doctype: "Sales Order", customer: "Magic Peacock Studio", project: "PROJ-0005", status: "Draft" },
};
const soMetaResponse = {
  name: "Sales Order",
  fields: [
    { fieldname: "customer", fieldtype: "Link", options: "Customer" },
    { fieldname: "project", fieldtype: "Link", options: "Project" },
    { fieldname: "status", fieldtype: "Select", options: "Draft\nOpen" },
  ],
};
const projectDocResponse = {
  data: { name: "PROJ-0005", doctype: "Project", project_name: "Promotional Shoot", status: "Open" },
};

describe("cmdLink", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("fetches source doc, then meta, then linked doc (3 HTTP calls)", async () => {
    const spy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(soDocResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: soMetaResponse }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(projectDocResponse), { status: 200 }));

    const { restore } = captureOutput();
    await cmdLink(client, { doctype: "Sales Order", name: "SO-001", fieldname: "project", format: "json" });
    restore();

    expect(spy.mock.calls).toHaveLength(3);
  });

  it("outputs the linked doc", async () => {
    spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(soDocResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: soMetaResponse }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(projectDocResponse), { status: 200 }));

    const { lines, restore } = captureOutput();
    await cmdLink(client, { doctype: "Sales Order", name: "SO-001", fieldname: "project", format: "json" });
    restore();

    const doc = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(doc["name"]).toBe("PROJ-0005");
  });

  it("throws when field is empty", async () => {
    const emptyDoc = { data: { name: "SO-001", project: null } };
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(emptyDoc), { status: 200 }),
    );

    await expect(
      cmdLink(client, { doctype: "Sales Order", name: "SO-001", fieldname: "project" }),
    ).rejects.toThrow("empty");
  });

  it("throws when field is not a Link type", async () => {
    // soDocResponse has status: "Draft" — non-empty, so passes empty check
    // soMetaResponse has status as Select (non-Link), should throw
    spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(soDocResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: soMetaResponse }), { status: 200 }));

    await expect(
      cmdLink(client, { doctype: "Sales Order", name: "SO-001", fieldname: "status" }),
    ).rejects.toThrow("not a Link field");
  });
});
