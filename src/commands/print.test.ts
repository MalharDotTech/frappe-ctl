import { describe, it, expect, spyOn, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { FrappeClient } from "../client.ts";
import { cmdPrint } from "./print.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

function mockFetchBinary(data: Uint8Array, contentType = "application/pdf", status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(data, { status, headers: { "Content-Type": contentType } }),
  );
}

const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes

describe("cmdPrint", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("calls download_pdf endpoint", async () => {
    const spy = mockFetchBinary(fakePdf);
    spyOn(process.stdout, "write").mockImplementation(() => true);

    await cmdPrint(client, { doctype: "Sales Invoice", name: "SINV-001" });

    const [url] = spy.mock.calls[0] as [string];
    // URLSearchParams encodes spaces as + — decode both forms
    const decoded = decodeURIComponent(url).replace(/\+/g, " ");
    expect(decoded).toContain("download_pdf");
    expect(decoded).toContain("Sales Invoice");
    expect(decoded).toContain("SINV-001");
  });

  it("includes print format when provided", async () => {
    const spy = mockFetchBinary(fakePdf);
    spyOn(process.stdout, "write").mockImplementation(() => true);

    await cmdPrint(client, { doctype: "Sales Invoice", name: "SINV-001", printFormat: "Standard" });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("Standard");
  });

  it("saves to file when --output specified", async () => {
    mockFetchBinary(fakePdf);
    const outPath = join(tmpdir(), `frappe-print-test-${Date.now()}.pdf`);

    await cmdPrint(client, { doctype: "Sales Invoice", name: "SINV-001", outFile: outPath });

    expect(existsSync(outPath)).toBe(true);
    unlinkSync(outPath);
  });

  it("dry-run prints intent without HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdPrint(client, { doctype: "Sales Invoice", name: "SINV-001", dryRun: true });

    expect(spy).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[DRY RUN]");
  });
});
