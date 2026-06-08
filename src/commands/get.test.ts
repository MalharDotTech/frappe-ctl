import { describe, it, expect } from "bun:test";
import { parseFilter } from "./get.ts";

// parseFilter is pure — no mocks needed, exhaustive coverage is cheap

describe("parseFilter", () => {
  it("parses = operator", () => {
    expect(parseFilter("status=Open")).toEqual(["status", "=", "Open"]);
  });

  it("parses != operator", () => {
    expect(parseFilter("status!=Cancelled")).toEqual(["status", "!=", "Cancelled"]);
  });

  it("parses >= operator", () => {
    expect(parseFilter("grand_total>=10000")).toEqual(["grand_total", ">=", "10000"]);
  });

  it("parses <= operator", () => {
    expect(parseFilter("grand_total<=50000")).toEqual(["grand_total", "<=", "50000"]);
  });

  it("parses > operator", () => {
    expect(parseFilter("idx>0")).toEqual(["idx", ">", "0"]);
  });

  it("parses < operator", () => {
    expect(parseFilter("idx<100")).toEqual(["idx", "<", "100"]);
  });

  it("trims whitespace around field and value", () => {
    expect(parseFilter("  status = Open  ")).toEqual(["status", "=", "Open"]);
  });

  it("allows value with spaces (e.g. customer name)", () => {
    expect(parseFilter("customer=Magic Peacock Studio")).toEqual([
      "customer",
      "=",
      "Magic Peacock Studio",
    ]);
  });

  it("allows value with = in it (e.g. base64)", () => {
    expect(parseFilter("token=abc=def")).toEqual(["token", "=", "abc=def"]);
  });

  it("throws on invalid filter with no operator", () => {
    expect(() => parseFilter("justafieldname")).toThrow("Invalid filter");
  });

  it("throws and mentions the bad input in error message", () => {
    let msg = "";
    try {
      parseFilter("bad-input");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("bad-input");
  });
});
