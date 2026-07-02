import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface Profile {
  url: string;
  api_key?: string;    // optional when using OAuth (auth_type: "oauth")
  api_secret?: string; // optional when using OAuth
  client_id?: string;  // OAuth client ID — stored after first 'auth login --client-id'
  app_versions?: Record<string, string>;  // { "next": "v16", "hr": "v16" } — vX format
}

export interface Config {
  default: string;
  profiles: Record<string, Profile>;
}

// Read env var at call time (not module load time) so tests can inject via FRAPPE_CTL_CONFIG_DIR
function configDir(): string {
  return process.env["FRAPPE_CTL_CONFIG_DIR"] ?? join(process.env["HOME"] ?? "~", ".config", "frappe-ctl");
}
function configFile(): string {
  return join(configDir(), "config.json");
}

function emptyConfig(): Config {
  return { default: "", profiles: {} };
}

export function loadConfig(): Config {
  if (!existsSync(configFile())) return emptyConfig();
  try {
    return JSON.parse(readFileSync(configFile(), "utf8")) as Config;
  } catch {
    return emptyConfig();
  }
}

function saveConfig(cfg: Config): void {
  if (!existsSync(configDir())) mkdirSync(configDir(), { recursive: true });
  // 0o600 — owner read/write only. Profiles carry api_key/api_secret in plaintext.
  writeFileSync(configFile(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600, encoding: "utf8" });
}

export function getActiveProfile(cfg: Config, override?: string): Profile {
  const name = override ?? cfg.default;
  if (!name) {
    throw new Error(
      "No active profile. Run: frappe-ctl profile add <name> --url <url> --key <key> --secret <secret>",
    );
  }
  const profile = cfg.profiles[name];
  if (!profile) {
    throw new Error(`Profile '${name}' not found. Run: frappe-ctl profile list`);
  }
  return profile;
}

// ── Profile commands ──────────────────────────────────────────────────────────

export function profileAdd(
  name: string,
  url: string,
  apiKey: string,
  apiSecret: string,
  appVersions?: Record<string, string>,
): void {
  const cfg = loadConfig();
  const existing = cfg.profiles[name];
  cfg.profiles[name] = {
    url,
    api_key: apiKey,
    api_secret: apiSecret,
    // Merge: existing versions survive, new ones overwrite per-key
    app_versions: appVersions
      ? { ...(existing?.app_versions ?? {}), ...appVersions }
      : existing?.app_versions,
  };
  if (!cfg.default) cfg.default = name;
  saveConfig(cfg);
  console.log(`Profile '${name}' saved.${cfg.default === name ? " (set as default)" : ""}`);
}

export function profileUse(name: string): void {
  const cfg = loadConfig();
  if (!cfg.profiles[name]) {
    throw new Error(`Profile '${name}' not found.`);
  }
  cfg.default = name;
  saveConfig(cfg);
  console.log(`Active profile → '${name}'`);
}

export function profileList(): void {
  const cfg = loadConfig();
  const names = Object.keys(cfg.profiles);
  if (!names.length) {
    console.log("No profiles configured. Run: frappe-ctl profile add <name> ...");
    return;
  }
  for (const name of names) {
    const p = cfg.profiles[name]!;
    const active = name === cfg.default ? " *" : "  ";
    const versions = p.app_versions
      ? "  [" + Object.entries(p.app_versions).map(([a, v]) => `${a}:${v}`).join(" ") + "]"
      : "";
    console.log(`${active} ${name.padEnd(16)} ${p.url}${versions}`);
  }
}

// Persists client_id to an existing profile — called by 'auth login --client-id'
export function profileUpdateClientId(name: string, clientId: string): void {
  const cfg = loadConfig();
  const profile = cfg.profiles[name];
  if (!profile) throw new Error(`Profile '${name}' not found.`);
  cfg.profiles[name] = { ...profile, client_id: clientId };
  saveConfig(cfg);
}

export function profileRemove(name: string): void {
  const cfg = loadConfig();
  if (!cfg.profiles[name]) {
    throw new Error(`Profile '${name}' not found.`);
  }
  delete cfg.profiles[name];
  if (cfg.default === name) {
    const remaining = Object.keys(cfg.profiles);
    cfg.default = remaining[0] ?? "";
    if (cfg.default) console.log(`Active profile switched to '${cfg.default}'`);
  }
  saveConfig(cfg);
  console.log(`Profile '${name}' removed.`);
}
