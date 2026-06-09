// OAuth 2.0 + PKCE helpers for Frappe Cloud auth
// ADR-009: Authorization Code + PKCE, S256 only, explicit client_id, per-site OAuth server

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;   // seconds
  token_type: "Bearer";
  scope?: string;
}

// ── PKCE crypto ────────────────────────────────────────────────────────────────

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// 48 random bytes → 64 base64url chars (well within RFC 7636's 43–128 requirement)
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

// S256: base64url(sha256(ASCII(verifier)))
// Frappe only supports S256 — plain is not in code_challenge_methods_supported
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64url(new Uint8Array(digest));
}

// 16 random bytes → 32 hex chars. Used as state parameter to prevent CSRF.
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Authorization URL ──────────────────────────────────────────────────────────

export function buildAuthUrl(
  siteUrl: string,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid all",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return `${siteUrl.replace(/\/$/, "")}/api/method/frappe.integrations.oauth2.authorize?${params}`;
}

// ── Local redirect server ──────────────────────────────────────────────────────
// Spins up a Bun.serve listener on localhost:port, captures the OAuth redirect,
// shuts itself down, and resolves the promise with { code, state }.

export function startLocalServer(
  port: number,
  timeoutMs = 120_000,
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.stop(true);
      reject(new Error("OAuth timeout — no redirect received within 120s. Try again."));
    }, timeoutMs);

    const server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDesc = url.searchParams.get("error_description") ?? "";

        clearTimeout(timer);
        server.stop(true);

        if (error) {
          reject(new Error(`OAuth denied: ${error}${errorDesc ? ` — ${errorDesc}` : ""}`));
          return htmlResponse("Authorization failed.", "You may close this window.");
        }

        if (!code || !state) {
          reject(new Error("OAuth redirect missing code or state parameter"));
          return htmlResponse("Authorization failed.", "Missing parameters.");
        }

        resolve({ code, state });
        return htmlResponse(
          "Authorization successful!",
          "You may close this window and return to the terminal.",
        );
      },
    });
  });
}

function htmlResponse(heading: string, body: string): Response {
  return new Response(
    `<html><body><h2>${heading}</h2><p>${body}</p></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

// ── Browser launch ─────────────────────────────────────────────────────────────

export function openBrowser(url: string): void {
  if (process.platform === "darwin") {
    Bun.spawnSync(["open", url]);
  } else if (process.platform === "linux") {
    Bun.spawnSync(["xdg-open", url]);
  } else {
    Bun.spawnSync(["cmd", "/c", "start", url]);
  }
}

// ── Token exchange ─────────────────────────────────────────────────────────────

export async function exchangeCode(
  siteUrl: string,
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const url = `${siteUrl.replace(/\/$/, "")}/api/method/frappe.integrations.oauth2.get_token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(
  siteUrl: string,
  clientId: string,
  refreshToken: string,
): Promise<TokenResponse> {
  const url = `${siteUrl.replace(/\/$/, "")}/api/method/frappe.integrations.oauth2.get_token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

// Best-effort server-side revocation (logout). Ignores errors — local token is
// always deleted regardless of whether server-side revocation succeeds.
export async function revokeToken(siteUrl: string, token: string): Promise<void> {
  try {
    const url = `${siteUrl.replace(/\/$/, "")}/api/method/frappe.integrations.oauth2.revoke_token`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // Intentionally swallowed — local token is deleted regardless
  }
}
