import { describe, it, expect, spyOn, afterEach, beforeEach } from "bun:test";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { FrappeClient } from "../client.ts";
import { cmdAttach } from "./attach.ts";

const client = new FrappeClient({ url: "http://test.localhost", apiKey: "k", apiSecret: "s" });

const attachResponse = {
  message: { file_url: "/files/invoice.pdf", name: "invoice.pdf", is_private: 0 },
};

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "attach-test-")); });
afterEach(() => {
  spyOn(globalThis, "fetch").mockRestore();
  rmSync(tmpDir, { recursive: true });
});

describe("cmdAttach", () => {
  it("calls upload_file method", async () => {
    const spy = mockFetch(attachResponse);
    const file = join(tmpDir, "invoice.pdf");
    writeFileSync(file, "PDF content here");
    spyOn(console, "log").mockImplementation(() => {});

    await cmdAttach(client, { doctype: "Sales Invoice", name: "SINV-001", file });

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("upload_file");
  });

  it("sends multipart form with doctype and docname", async () => {
    const spy = mockFetch(attachResponse);
    const file = join(tmpDir, "doc.txt");
    writeFileSync(file, "hello");
    spyOn(console, "log").mockImplementation(() => {});

    await cmdAttach(client, { doctype: "Sales Invoice", name: "SINV-001", file });

    const [, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(opts.body).toBeInstanceOf(FormData);
    const form = opts.body as FormData;
    expect(form.get("doctype")).toBe("Sales Invoice");
    expect(form.get("docname")).toBe("SINV-001");
  });

  it("prints file_url on success", async () => {
    const file = join(tmpDir, "f.txt");
    writeFileSync(file, "data");
    mockFetch(attachResponse);
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAttach(client, { doctype: "Sales Invoice", name: "SINV-001", file });

    expect(logs.join("\n")).toContain("/files/invoice.pdf");
  });

  it("throws when file does not exist", async () => {
    await expect(
      cmdAttach(client, { doctype: "Customer", name: "CUST-001", file: "/no/such/file.pdf" }),
    ).rejects.toThrow();
  });

  it("dry-run prints intent without HTTP call", async () => {
    const spy = spyOn(globalThis, "fetch");
    const file = join(tmpDir, "x.txt");
    writeFileSync(file, "x");
    const logs: string[] = [];
    spyOn(console, "log").mockImplementation((m) => logs.push(String(m)));

    await cmdAttach(client, { doctype: "Customer", name: "CUST-001", file, dryRun: true });

    expect(spy).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("[DRY RUN]");
  });
});
