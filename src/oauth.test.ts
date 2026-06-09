import { describe, it, expect, spyOn, afterEach } from "bun:test";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
} from "./oauth.ts";

afterEach(() => spyOn(globalThis, "fetch").mockRestore());

// ── PKCE helpers ──────────────────────────────────────────────────────────────

describe("generateCodeVerifier", () => {
  it("returns a string of 64 base64url characters", () => {
    const v = generateCodeVerifier();
    expect(v.length).toBe(64);
    // base64url chars only: A-Z a-z 0-9 - _
    expect(/^[A-Za-z0-9\-_]+$/.test(v)).toBe(true);
  });

  it("generates unique verifiers each call", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("generateCodeChallenge", () => {
  it("returns a non-empty base64url string", async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(0);
    expect(/^[A-Za-z0-9\-_]+$/.test(challenge)).toBe(true);
  });

  it("is deterministic for same verifier", async () => {
    const verifier = "dGhpcyBpcyBhIHRlc3QgdmVyaWZpZXI";
    const c1 = await generateCodeChallenge(verifier);
    const c2 = await generateCodeChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it("differs from the verifier (S256 not plain)", async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).not.toBe(verifier);
  });
});

describe("generateState", () => {
  it("returns a 32-char hex string", () => {
    const s = generateState();
    expect(s.length).toBe(32);
    expect(/^[0-9a-f]+$/.test(s)).toBe(true);
  });

  it("generates unique states each call", () => {
    expect(generateState()).not.toBe(generateState());
  });
});

// ── buildAuthUrl ──────────────────────────────────────────────────────────────

describe("buildAuthUrl", () => {
  it("builds a valid authorization URL with all required params", () => {
    const url = new URL(
      buildAuthUrl(
        "https://demo.erpnext.com",
        "my_client_id",
        "http://localhost:57312",
        "some_challenge",
        "some_state",
      ),
    );
    expect(url.origin).toBe("https://demo.erpnext.com");
    expect(url.pathname).toBe("/api/method/frappe.integrations.oauth2.authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("my_client_id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:57312");
    expect(url.searchParams.get("scope")).toBe("openid all");
    expect(url.searchParams.get("code_challenge")).toBe("some_challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("some_state");
  });

  it("strips trailing slash from site URL", () => {
    const url = buildAuthUrl("https://demo.erpnext.com/", "cid", "http://localhost:1234", "ch", "st");
    expect(url.startsWith("https://demo.erpnext.com/api/")).toBe(true);
    expect(url).not.toContain("//api/");
  });
});

// ── exchangeCode ──────────────────────────────────────────────────────────────

const tokenResponse = {
  access_token: "tok_abc",
  refresh_token: "ref_xyz",
  expires_in: 3600,
  token_type: "Bearer" as const,
};

describe("exchangeCode", () => {
  it("POSTs to get_token with correct form body and returns tokens", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(tokenResponse), { status: 200 }),
    );

    const result = await exchangeCode(
      "https://demo.erpnext.com",
      "my_client",
      "auth_code_123",
      "verifier_abc",
      "http://localhost:57312",
    );

    expect(result.access_token).toBe("tok_abc");
    expect(result.refresh_token).toBe("ref_xyz");
    expect(result.expires_in).toBe(3600);

    // Verify request shape
    const [url, init] = (globalThis.fetch as ReturnType<typeof spyOn>).mock.calls[0]! as [string, RequestInit];
    expect(url).toContain("frappe.integrations.oauth2.get_token");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth_code_123");
    expect(body.get("client_id")).toBe("my_client");
    expect(body.get("code_verifier")).toBe("verifier_abc");
    expect(body.get("redirect_uri")).toBe("http://localhost:57312");
  });

  it("throws on non-200 response", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("invalid_grant", { status: 400 }),
    );
    await expect(
      exchangeCode("https://demo.erpnext.com", "cid", "bad_code", "ver", "http://localhost:1"),
    ).rejects.toThrow(/400/);
  });
});

// ── refreshAccessToken ────────────────────────────────────────────────────────

describe("refreshAccessToken", () => {
  it("POSTs grant_type=refresh_token and returns new tokens", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(tokenResponse), { status: 200 }),
    );

    const result = await refreshAccessToken(
      "https://demo.erpnext.com",
      "my_client",
      "ref_xyz",
    );

    expect(result.access_token).toBe("tok_abc");

    const [, init] = (globalThis.fetch as ReturnType<typeof spyOn>).mock.calls[0]! as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("ref_xyz");
    expect(body.get("client_id")).toBe("my_client");
  });

  it("throws on 401 (refresh token expired)", async () => {
    spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("invalid_grant", { status: 401 }),
    );
    await expect(
      refreshAccessToken("https://demo.erpnext.com", "cid", "expired_ref"),
    ).rejects.toThrow(/401/);
  });
});
