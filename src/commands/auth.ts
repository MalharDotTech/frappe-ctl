import { loadConfig, getActiveProfile, profileUpdateClientId } from "../config.ts";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  openBrowser,
  startLocalServer,
  exchangeCode,
  revokeToken,
} from "../oauth.ts";
import { saveToken, loadToken, deleteToken, isTokenExpired } from "../token-store.ts";
import type { StoredToken } from "../token-store.ts";

export interface AuthLoginArgs {
  site?: string;      // profile name override
  clientId?: string;  // --client-id flag (stored in profile after first use)
}

export interface AuthLogoutArgs {
  site?: string;
}

export interface AuthStatusArgs {
  site?: string;
}

// ── login ─────────────────────────────────────────────────────────────────────

export async function cmdAuthLogin(args: AuthLoginArgs): Promise<void> {
  const cfg = loadConfig();
  const profileName = args.site ?? cfg.default;
  const profile = getActiveProfile(cfg, args.site);

  const clientId = args.clientId ?? profile.client_id;
  if (!clientId) {
    throw new Error(
      `No client_id configured for profile '${profileName}'.\n\n` +
      `Steps:\n` +
      `  1. Open ${profile.url}\n` +
      `  2. Awesomebar → "OAuth Client" → New\n` +
      `  3. Set redirect URI: http://localhost:<any_port>\n` +
      `  4. Copy the Client ID\n` +
      `  5. Run: frappe-ctl auth login --client-id <id>\n`,
    );
  }

  // Random port in ephemeral range — registered redirect URI must use explicit port (Frappe quirk)
  const port = 49152 + Math.floor(Math.random() * 16383);
  const redirectUri = `http://localhost:${port}`;

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  const authUrl = buildAuthUrl(profile.url, clientId, redirectUri, challenge, state);

  console.error(`\nOpening browser for OAuth authorization...`);
  console.error(`  Site: ${profile.url}`);
  console.error(`  Redirect: ${redirectUri}`);
  console.error(`\n  If browser does not open automatically, visit:\n  ${authUrl}\n`);

  // Start listener BEFORE opening browser to avoid race condition
  const serverPromise = startLocalServer(port);
  openBrowser(authUrl);

  const { code, state: returnedState } = await serverPromise;

  if (returnedState !== state) {
    throw new Error("OAuth state mismatch — possible CSRF. Aborting login.");
  }

  console.error("Exchanging authorization code for tokens...");
  const tokens = await exchangeCode(profile.url, clientId, code, verifier, redirectUri);

  const stored: StoredToken = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    client_id: clientId,
  };

  saveToken(profile.url, stored);

  // Persist client_id to profile so future auth logins don't require --client-id
  if (args.clientId && args.clientId !== profile.client_id) {
    profileUpdateClientId(profileName, clientId);
  }

  const expiresInMin = Math.floor(tokens.expires_in / 60);
  console.log(`Authenticated. Profile '${profileName}' now using OAuth Bearer.`);
  console.log(`Token expires in ${expiresInMin} minutes. Refresh token stored for auto-renewal.`);
}

// ── logout ────────────────────────────────────────────────────────────────────

export async function cmdAuthLogout(args: AuthLogoutArgs): Promise<void> {
  const cfg = loadConfig();
  const profile = getActiveProfile(cfg, args.site);

  const stored = loadToken(profile.url);
  if (stored) {
    await revokeToken(profile.url, stored.access_token);
    deleteToken(profile.url);
  }

  console.log(`Logged out from ${profile.url}`);
}

// ── status ────────────────────────────────────────────────────────────────────

export function cmdAuthStatus(args: AuthStatusArgs): void {
  const cfg = loadConfig();
  const profile = getActiveProfile(cfg, args.site);

  const stored = loadToken(profile.url);

  console.log(`Site:    ${profile.url}`);

  if (!stored) {
    console.log(`Auth:    api_key (token key:secret)`);
    console.log(`Token:   none — run 'frappe-ctl auth login' to use OAuth`);
    return;
  }

  const expired = isTokenExpired(stored);
  const msLeft = stored.expires_at - Date.now();
  const minLeft = Math.floor(msLeft / 1000 / 60);

  console.log(`Auth:    OAuth Bearer`);
  console.log(`Token:   ${expired ? "EXPIRED — run 'frappe-ctl auth login' to renew" : `valid, ~${minLeft}m remaining`}`);
  console.log(`Client:  ${stored.client_id}`);
}
