import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { FrappeClient, FrappeRequestError } from "./client.ts";
import {
  userListResponse,
  userGetResponse,
  emptyListResponse,
  countResponse,
} from "./__fixtures__/api-responses.ts";

const TEST_CONFIG = {
  url: "http://test.localhost:8080",
  apiKey: "testapikey123",
  apiSecret: "testapisecret456",
};

function makeClient() {
  return new FrappeClient(TEST_CONFIG);
}

function mockFetch(body: unknown, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("FrappeClient — auth", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fetchSpy = mockFetch(userListResponse);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("sends Authorization header as 'token key:secret' — NOT Bearer, NOT Basic", async () => {
    const client = makeClient();
    await client.listDocs("User");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;

    // The one gotcha that trips every integration — must be exactly this format
    expect(headers["Authorization"]).toBe("token testapikey123:testapisecret456");
    expect(headers["Authorization"]).not.toMatch(/^Bearer/);
    expect(headers["Authorization"]).not.toMatch(/^Basic/);
  });

  it("strips trailing slash from base URL before building endpoints", async () => {
    const client = new FrappeClient({ ...TEST_CONFIG, url: "http://test.localhost:8080/" });
    await client.listDocs("User");
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).not.toContain("//api"); // double slash = bad URL build
  });
});

describe("FrappeClient — listDocs", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("hits correct endpoint for DocType", async () => {
    const spy = mockFetch(userListResponse);
    const client = makeClient();
    await client.listDocs("User");
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("/api/resource/User");
  });

  it("encodes DocType with spaces in URL", async () => {
    const spy = mockFetch(emptyListResponse);
    const client = makeClient();
    await client.listDocs("Sales Order");
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("Sales%20Order");
  });

  it("always sends fields=* when none specified — name-only default is useless", async () => {
    const spy = mockFetch(userListResponse);
    const client = makeClient();
    await client.listDocs("User");
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("fields=%5B%22*%22%5D"); // ["*"] encoded
  });

  it("sends filters when provided", async () => {
    const spy = mockFetch(userListResponse);
    const client = makeClient();
    await client.listDocs("User", { filters: [["enabled", "=", "1"]] });
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("filters=");
  });

  it("returns the data array", async () => {
    mockFetch(userListResponse);
    const client = makeClient();
    const result = await client.listDocs("User");
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Administrator");
  });
});

describe("FrappeClient — getDoc", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("hits /api/resource/DocType/name", async () => {
    const spy = mockFetch(userGetResponse);
    const client = makeClient();
    await client.getDoc("User", "Administrator");
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("/api/resource/User/Administrator");
  });

  it("returns the data object", async () => {
    mockFetch(userGetResponse);
    const client = makeClient();
    const doc = await client.getDoc("User", "Administrator");
    expect(doc["name"]).toBe("Administrator");
    expect(doc["email"]).toBe("admin@example.com");
  });
});

describe("FrappeClient — countDocs", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("calls frappe.client.get_count method", async () => {
    const spy = mockFetch(countResponse);
    const client = makeClient();
    await client.countDocs("User");
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("frappe.client.get_count");
  });

  it("returns the count number", async () => {
    mockFetch(countResponse);
    const client = makeClient();
    const count = await client.countDocs("User");
    expect(count).toBe(42);
  });
});

describe("FrappeClient — error handling", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("throws FrappeRequestError on 403", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ exc_type: "PermissionError", exception: "Not permitted" }),
        { status: 403 },
      ),
    );
    const client = makeClient();
    expect(client.listDocs("User")).rejects.toBeInstanceOf(FrappeRequestError);
  });

  it("throws FrappeRequestError on 404", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ exc_type: "DoesNotExistError" }), { status: 404 }),
    );
    const client = makeClient();
    expect(client.getDoc("User", "nobody")).rejects.toBeInstanceOf(FrappeRequestError);
  });

  it("includes statusCode on error", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 403 }),
    );
    const client = makeClient();
    try {
      await client.listDocs("User");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FrappeRequestError);
      expect((e as FrappeRequestError).statusCode).toBe(403);
    }
  });

  it("throws on network error (no status code)", async () => {
    spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const client = makeClient();
    try {
      await client.listDocs("User");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FrappeRequestError);
      expect((e as FrappeRequestError).statusCode).toBe(0);
    }
  });

  // Regression guard: apiKey/apiSecret must never surface in an error an
  // agent invoking frappe-ctl as a subprocess could see. Covers every path
  // that constructs a FrappeRequestError message.
  describe("never leaks credentials into error output", () => {
    const assertNoLeak = (e: unknown) => {
      expect(e).toBeInstanceOf(FrappeRequestError);
      const err = e as FrappeRequestError;
      for (const field of [err.message, err.serverMessage ?? ""]) {
        expect(field).not.toContain(TEST_CONFIG.apiKey);
        expect(field).not.toContain(TEST_CONFIG.apiSecret);
        expect(field).not.toContain(`token ${TEST_CONFIG.apiKey}:${TEST_CONFIG.apiSecret}`);
      }
    };

    it("on HTTP error response", async () => {
      spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ exc_type: "PermissionError", exception: "Not permitted" }), { status: 403 }),
      );
      try {
        await makeClient().listDocs("User");
        throw new Error("should have thrown");
      } catch (e) {
        assertNoLeak(e);
      }
    });

    it("on network failure", async () => {
      spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
      try {
        await makeClient().listDocs("User");
        throw new Error("should have thrown");
      } catch (e) {
        assertNoLeak(e);
      }
    });

    it("on malformed JSON response", async () => {
      spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("not json", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      try {
        await makeClient().listDocs("User");
        throw new Error("should have thrown");
      } catch (e) {
        assertNoLeak(e);
      }
    });
  });
});

describe("FrappeClient.waitForJob", () => {
  afterEach(() => spyOn(globalThis, "fetch").mockRestore());

  it("polls until finished and returns result", async () => {
    const spy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { status: "started" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { status: "finished", result: { ok: true } } }), { status: 200 }));

    const client = makeClient();
    const info = await client.waitForJob("job-123", { intervalMs: 0 });

    expect(info.status).toBe("finished");
    expect((info.result as Record<string, unknown>)?.ok).toBe(true);
    expect(spy.mock.calls.length).toBe(2);
  });

  it("returns immediately when already finished", async () => {
    const spy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { status: "finished", result: "done" } }), { status: 200 }));

    const client = makeClient();
    const info = await client.waitForJob("job-456", { intervalMs: 0 });

    expect(info.status).toBe("finished");
    expect(spy.mock.calls.length).toBe(1);
  });

  it("returns failed status without throwing", async () => {
    spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { status: "failed", exc_info: "ValueError" } }), { status: 200 }));

    const client = makeClient();
    const info = await client.waitForJob("job-789", { intervalMs: 0 });

    expect(info.status).toBe("failed");
    expect(info.exc_info).toBe("ValueError");
  });

  it("throws on timeout", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: { status: "started" } }), { status: 200 }),
    );

    const client = makeClient();
    try {
      await client.waitForJob("job-slow", { intervalMs: 0, timeoutMs: 1 });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("timed out");
    }
  });
});
