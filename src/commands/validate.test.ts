import { describe, it, expect, spyOn, afterEach, mock } from "bun:test";
import { FrappeClient } from "../client.ts";
import { cmdValidate } from "./validate.ts";
import { doctypeMetaResponse } from "../__fixtures__/api-responses.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("cmdValidate", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("outputs OK when all required fields present", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    // doctypeMetaResponse has customer (reqd=1) and transaction_date (reqd=1)
    await cmdValidate(client, {
      doctype: "Sales Order",
      data: { customer: "Magic Peacock Studio", transaction_date: "2026-06-10" },
    });

    expect(logs[0]).toBe("OK: all required fields present");
  });

  it("exits 1 and reports MISSING fields", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const errors: string[] = [];
    spyOn(console, "error").mockImplementation((m) => errors.push(String(m)));

    const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as () => never);

    await cmdValidate(client, {
      doctype: "Sales Order",
      data: { customer: "Magic Peacock Studio" }, // missing transaction_date
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errors.some((e) => e.includes("MISSING") && e.includes("transaction_date"))).toBe(true);
    exitSpy.mockRestore();
  });

  it("reports UNKNOWN FIELD for unrecognised keys", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const errors: string[] = [];
    spyOn(console, "error").mockImplementation((m) => errors.push(String(m)));
    spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as () => never);

    await cmdValidate(client, {
      doctype: "Sales Order",
      data: {
        customer: "Magic Peacock Studio",
        transaction_date: "2026-06-10",
        nonexistent_field: "value",
      },
    });

    expect(errors.some((e) => e.includes("UNKNOWN FIELD") && e.includes("nonexistent_field"))).toBe(true);
    exitSpy.mockRestore();
  });

  it("suggests close field names for typos", async () => {
    mockFetch({ message: doctypeMetaResponse });
    const errors: string[] = [];
    spyOn(console, "error").mockImplementation((m) => errors.push(String(m)));
    spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as () => never);

    await cmdValidate(client, {
      doctype: "Sales Order",
      data: {
        customer: "Magic Peacock Studio",
        transaction_date: "2026-06-10",
        custumer: "typo",  // close to "customer"
      },
    });

    const unknownLine = errors.find((e) => e.includes("custumer"));
    expect(unknownLine).toContain("did you mean: customer");
    exitSpy.mockRestore();
  });
});
