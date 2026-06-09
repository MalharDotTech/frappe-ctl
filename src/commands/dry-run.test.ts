import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdCreate, cmdPatch, cmdDelete } from "./write.ts";
import { cmdSubmit, cmdCancel } from "./lifecycle.ts";
import { captureOutput } from "../__fixtures__/test-helpers.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

describe("--dry-run", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("create dry-run prints payload, makes no HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const { lines, restore } = captureOutput();

    await cmdCreate(client, {
      doctype: "Customer",
      data: { customer_name: "Acme", customer_type: "Company" },
      dryRun: true,
    });
    restore();

    expect(spy).not.toHaveBeenCalled();
    const out = lines.join("\n");
    expect(out).toContain("[DRY RUN]");
    expect(out).toContain("Customer");
    expect(out).toContain("Acme");
  });

  it("patch dry-run prints payload, makes no HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const { lines, restore } = captureOutput();

    await cmdPatch(client, {
      doctype: "SalesOrder",
      name: "SO-001",
      data: { status: "On Hold" },
      dryRun: true,
    });
    restore();

    expect(spy).not.toHaveBeenCalled();
    const out = lines.join("\n");
    expect(out).toContain("[DRY RUN]");
    expect(out).toContain("SO-001");
  });

  it("delete dry-run prints intent, makes no HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const { lines, restore } = captureOutput();

    await cmdDelete(client, {
      doctype: "Customer",
      name: "CUST-001",
      force: true,
      dryRun: true,
    });
    restore();

    expect(spy).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("[DRY RUN]");
  });

  it("submit dry-run makes no HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const { lines, restore } = captureOutput();

    await cmdSubmit(client, { doctype: "SalesOrder", name: "SO-001", dryRun: true });
    restore();

    expect(spy).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("[DRY RUN]");
  });

  it("cancel dry-run makes no HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const { lines, restore } = captureOutput();

    await cmdCancel(client, { doctype: "SalesOrder", name: "SO-001", dryRun: true });
    restore();

    expect(spy).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("[DRY RUN]");
  });
});
