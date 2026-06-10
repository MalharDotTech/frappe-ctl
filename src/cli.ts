#!/usr/bin/env bun
import { FrappeClient, FrappeRequestError } from "./client.ts";
import { loadConfig, getActiveProfile, profileAdd, profileUse, profileList, profileRemove } from "./config.ts";
import { resolveApp, APPS } from "./apps.ts";
import { cmdGet, parseFilter } from "./commands/get.ts";
import { cmdDescribe } from "./commands/describe.ts";
import { cmdCreate, cmdPatch, cmdDelete } from "./commands/write.ts";
import { cmdSubmit, cmdCancel } from "./commands/lifecycle.ts";
import { cmdCall } from "./commands/call.ts";
import { cmdReport } from "./commands/report.ts";
import { cmdResources } from "./commands/resources.ts";
import { cmdAgentContext } from "./commands/agent-context.ts";
import { cmdApply } from "./commands/apply.ts";
import { cmdLogs } from "./commands/logs.ts";
import { cmdWorkflow } from "./commands/workflow.ts";
import { cmdBulk } from "./commands/bulk.ts";
import { cmdAttach } from "./commands/attach.ts";
import { cmdPrint } from "./commands/print.ts";
import { cmdCount } from "./commands/count.ts";
import { cmdSearch } from "./commands/search.ts";
import { cmdLink } from "./commands/link.ts";
import { cmdValidate } from "./commands/validate.ts";
import { cmdDiff } from "./commands/diff.ts";
import { cmdAuthLogin, cmdAuthLogout, cmdAuthStatus } from "./commands/auth.ts";
import { loadToken, isTokenExpired } from "./token-store.ts";
import { refreshAccessToken } from "./oauth.ts";
import type { StoredToken } from "./token-store.ts";
import { saveToken } from "./token-store.ts";

const VERSION = "0.1.0";

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function usage(): void {
  console.log(`frappe-ctl v${VERSION}

USAGE
  frappe-ctl [--site <profile>] <app> <verb> [DocType] [name] [flags]
  frappe-ctl profile <add|use|list|remove> [args]
  frappe-ctl auth <login|logout|status> [--site <profile>] [--client-id <id>] [--port <n>]

APPS
${Object.values(APPS).map((a) => `  ${a.alias.padEnd(10)} ${a.name}`).join("\n")}

VERBS
  get        List or fetch docs            frappe-ctl next get SalesOrder [name]
  count      Count docs matching filter    frappe-ctl next count "Sales Order" --filter "status=Open"
  search     Text search within DocType    frappe-ctl next search Project "V Builders"
  describe   DocType schema + fields       frappe-ctl next describe SalesOrder [--required|--compact|--names-only|--relationships]
  link       Follow a Link field           frappe-ctl next link "Sales Order" SO-001 project
  validate   Pre-flight required fields    frappe-ctl next validate "Purchase Order" --data '{...}'
  diff       Show what a patch would change frappe-ctl next diff Project PROJ-001 --data '{...}'
  apply      Create or update from file    frappe-ctl next apply -f doc.json
  create     Create a new doc              frappe-ctl next create SalesOrder --data '{...}'
  patch      Update fields on a doc        frappe-ctl next patch SalesOrder SO-001 --data '{...}'
  delete     Delete a doc (needs --force)  frappe-ctl next delete SalesOrder SO-001 --force
  submit     Submit (docstatus 0→1)        frappe-ctl next submit SalesOrder SO-001
  cancel     Cancel (docstatus 1→2)        frappe-ctl next cancel SalesOrder SO-001
  call       Call any whitelisted method   frappe-ctl next call frappe.client.get_list --data '{...}'
  report     Run a saved ERPNext Report    frappe-ctl next report "Project Billing Summary"
  resources  List all DocTypes for app     frappe-ctl next resources [--compact] [--submittable]
  logs       Tail Frappe error log         frappe-ctl next logs [--since YYYY-MM-DD] [--compact]
  bulk       Patch or delete many docs     frappe-ctl next bulk patch SalesOrder --filter "status=Draft" --data '{...}'
  workflow   Apply workflow action         frappe-ctl next workflow SalesOrder SO-001 --action "Approve"
  attach     Upload file to a doc         frappe-ctl next attach SalesInvoice SINV-001 --file invoice.pdf
  print      Download PDF (print format)  frappe-ctl next print SalesInvoice SINV-001 --output invoice.pdf
  agent-context  Machine-readable schema (for LLM tool registration)

FLAGS
  --site <profile>              Override active profile
  --filter "field=value"        Filter (repeatable, get/count/search/bulk)
  --fields name,status,...      Fields to return (default: all)
  --limit <n>                   Max results (default: 20)
  --data '{"field":"value"}'    JSON payload (create/patch/validate/diff)
  --force                       Skip confirmation (delete)
  --dry-run                     Show what would happen, no writes
  --sparse                      Strip null/empty/zero fields from output
  --strip-meta                  Remove Frappe system fields (owner, creation, etc)
  -o, --output json|table|csv   Output format

ENV
  FRAPPE_CTL_READONLY=1         Block all mutations (safe for read-only agents)
  FRAPPE_CTL_CONFIG_DIR         Override config directory (default: ~/.config/frappe-ctl)
  FRAPPE_CTL_NO_KEYCHAIN=1      Skip OS keychain, use file-only token storage (CI / sandboxed envs)

EXAMPLES
  frappe-ctl next get Customer --sparse
  frappe-ctl next get SalesOrder --filter "status=Open" --limit 50
  frappe-ctl next count "Sales Order" --filter "status=Open"
  frappe-ctl next search Project "V Builders"
  frappe-ctl next describe SalesOrder --required
  frappe-ctl next describe SalesOrder --relationships
  frappe-ctl next link "Sales Order" SO-001 project
  frappe-ctl next validate "Purchase Order" --data '{"supplier":"Acme"}'
  frappe-ctl next diff Project PROJ-001 --data '{"status":"Completed"}'
  frappe-ctl next create Customer --data '{"customer_name":"Acme","customer_type":"Company"}'
  frappe-ctl next patch SalesOrder SO-001 --data '{"status":"On Hold"}' --sparse
  frappe-ctl next delete SalesOrder SO-001 --force
  frappe-ctl next submit SalesOrder SO-001
  frappe-ctl next cancel SalesOrder SO-001
  frappe-ctl next resources --compact --submittable
  frappe-ctl next logs --since 2026-06-10 --compact
  frappe-ctl next agent-context --doctypes "Project,Sales Order" --compact --include-counts

PROFILE MANAGEMENT
  frappe-ctl profile add uat --url http://localhost:8080 --key abc --secret xyz
  frappe-ctl profile add uat --url http://localhost:8080 --api-key abc --api-secret xyz  (alias)
  frappe-ctl profile use prod
  frappe-ctl profile list
  frappe-ctl profile remove uat

OAUTH (FRAPPE CLOUD)
  frappe-ctl auth login --client-id <id>             # PKCE flow, opens browser, default port 8756
  frappe-ctl auth login --site prod --client-id <id> --port 8756
  frappe-ctl auth logout
  frappe-ctl auth status
`);
}

// ── arg parser (no external deps) ────────────────────────────────────────────

interface ParsedArgs {
  site?: string;
  app?: string;
  verb?: string;
  positional: string[];
  flags: Record<string, string | true>;
  filters: string[];
  appVersions: string[];  // --app-version next=v16 (repeatable)
  dryRun: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { positional: [], flags: {}, filters: [], appVersions: [], dryRun: false };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === "--site" || arg === "-s") {
      result.site = argv[++i] ?? die("--site requires a value");
    } else if (arg === "--file") {
      result.flags["file"] = argv[++i] ?? die("--file requires a value");
    } else if (arg === "--filter" || arg === "-f") {
      result.filters.push(argv[++i] ?? die("--filter requires a value"));
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--app-version") {
      result.appVersions.push(argv[++i] ?? die("--app-version requires a value"));
    } else if (arg === "--fields") {
      result.flags["fields"] = argv[++i] ?? die("--fields requires a value");
    } else if (arg === "--limit" || arg === "-l") {
      result.flags["limit"] = argv[++i] ?? die("--limit requires a value");
    } else if (arg === "--output" || arg === "-o") {
      result.flags["output"] = argv[++i] ?? die("--output requires a value");
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        result.flags[key] = next;
        i++;
      } else {
        result.flags[key] = true;
      }
    } else {
      result.positional.push(arg);
    }
    i++;
  }

  // positional[0] = app, positional[1] = verb, positional[2+] = doctype/name
  [result.app, result.verb, ...result.positional] = result.positional as [
    string | undefined,
    string | undefined,
    ...string[],
  ];

  // Normalize PascalCase DocType → "Title Case" (SalesOrder → Sales Order)
  if (result.positional[0]) {
    result.positional[0] = result.positional[0].replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  return result;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    usage();
    return;
  }

  if (argv[0] === "--version" || argv[0] === "-v") {
    console.log(VERSION);
    return;
  }

  // agent-context — no app/site context needed for the static CLI schema dump
  if (argv[0] === "agent-context") {
    const parsed = parseArgs(argv.slice(1));
    if (parsed.flags["include-counts"]) {
      die("--include-counts requires an app prefix to resolve a profile.\nUse: frappe-ctl next agent-context --doctypes \"...\" --include-counts");
    }
    const doctypes = parsed.flags["doctypes"] ? String(parsed.flags["doctypes"]).split(",").map((s) => s.trim()) : undefined;
    await cmdAgentContext({ doctypes, compact: parsed.flags["compact"] === true });
    return;
  }

  // auth sub-command — manages OAuth tokens, no app context needed
  if (argv[0] === "auth") {
    const sub = argv[1];
    const parsed = parseArgs(argv.slice(2));
    switch (sub) {
      case "login": {
        const clientId = parsed.flags["client-id"] ? String(parsed.flags["client-id"]) : undefined;
        const port = parsed.flags["port"] ? parseInt(String(parsed.flags["port"]), 10) : undefined;
        await cmdAuthLogin({ site: parsed.site, clientId, port });
        break;
      }
      case "logout":
        await cmdAuthLogout({ site: parsed.site });
        break;
      case "status":
        cmdAuthStatus({ site: parsed.site });
        break;
      default:
        die(`Unknown auth command '${sub ?? ""}'. Valid: login, logout, status\n\nExamples:\n  frappe-ctl auth login --client-id <id>\n  frappe-ctl auth logout\n  frappe-ctl auth status`);
    }
    return;
  }

  // profile sub-command — no app/site context needed
  if (argv[0] === "profile") {
    const sub = argv[1];
    switch (sub) {
      case "add": {
        const name = argv[2] ?? die("profile add requires a name");
        const parsed = parseArgs(argv.slice(3));
        const url = String(parsed.flags["url"] ?? die("--url required"));
        const key = String(parsed.flags["key"] ?? parsed.flags["api-key"] ?? die("--key (or --api-key) required"));
        const secret = String(parsed.flags["secret"] ?? parsed.flags["api-secret"] ?? die("--secret (or --api-secret) required"));
        let appVersions: Record<string, string> | undefined;
        if (parsed.appVersions.length) {
          appVersions = {};
          for (const entry of parsed.appVersions) {
            const eqIdx = entry.indexOf("=");
            const alias = eqIdx > 0 ? entry.slice(0, eqIdx) : "";
            const version = eqIdx > 0 ? entry.slice(eqIdx + 1) : "";
            if (!alias || !version) die(`--app-version must be app=vX format, got '${entry}'`);
            if (!/^v\d+$/.test(version)) die(`version must be vX format (e.g. v16), got '${version}'`);
            appVersions[alias] = version;
          }
        }
        profileAdd(name, url, key, secret, appVersions);
        break;
      }
      case "use":
        profileUse(argv[2] ?? die("profile use requires a name"));
        break;
      case "list":
      case "ls":
        profileList();
        break;
      case "remove":
      case "rm":
        profileRemove(argv[2] ?? die("profile remove requires a name"));
        break;
      default:
        die(`Unknown profile command '${sub}'. Use: add, use, list, remove`);
    }
    return;
  }

  const args = parseArgs(argv);

  if (!args.app) {
    usage();
    return;
  }

  // Validate app
  try {
    resolveApp(args.app);
  } catch (e) {
    die((e as Error).message);
  }

  if (!args.verb) {
    die(`Verb required. Example: frappe-ctl ${args.app} get <DocType>`);
  }

  // Build client from active profile
  const cfg = loadConfig();
  let profile;
  try {
    profile = getActiveProfile(cfg, args.site);
  } catch (e) {
    die((e as Error).message);
  }

  // Auth resolution — OAuth Bearer takes priority over api_key:secret (ADR-009)
  let activeToken: StoredToken | null = loadToken(profile.url);

  if (activeToken && isTokenExpired(activeToken) && activeToken.refresh_token && profile.client_id) {
    try {
      const refreshed = await refreshAccessToken(profile.url, profile.client_id, activeToken.refresh_token);
      activeToken = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: Date.now() + refreshed.expires_in * 1000,
        client_id: profile.client_id,
      };
      saveToken(profile.url, activeToken);
    } catch {
      activeToken = null;
    }
  }

  const client = activeToken && !isTokenExpired(activeToken)
    ? new FrappeClient({ url: profile.url, bearerToken: activeToken.access_token })
    : new FrappeClient({ url: profile.url, apiKey: profile.api_key, apiSecret: profile.api_secret });

  const MUTATION_VERBS = ["create", "patch", "delete", "submit", "cancel", "call", "apply", "workflow", "attach", "bulk"];
  const readonly = process.env["FRAPPE_CTL_READONLY"] === "1";

  if (readonly && MUTATION_VERBS.includes(args.verb!)) {
    die(
      `Mutation blocked: FRAPPE_CTL_READONLY=1 is set.\n` +
      `Read-only verbs allowed: get, count, search, describe, link, validate, diff, report, resources.\n` +
      `Unset FRAPPE_CTL_READONLY to allow writes.`,
    );
  }

  const fmt = args.flags["output"] ? String(args.flags["output"]) : undefined;
  const sparse = args.flags["sparse"] === true;
  const stripMeta = args.flags["strip-meta"] === true;

  // Route verb
  switch (args.verb) {
    case "get": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} get SalesOrder`);
      const name = args.positional[1];
      const filters = args.filters.map(parseFilter);
      const fields = args.flags["fields"]
        ? String(args.flags["fields"]).split(",").map((f) => f.trim())
        : undefined;
      const limit = args.flags["limit"] ? parseInt(String(args.flags["limit"]), 10) : 20;

      await cmdGet(client, { doctype, name, filters, fields, limit, format: fmt, sparse, stripMeta });
      break;
    }

    case "count": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} count "Sales Order"`);
      const filters = args.filters.length ? args.filters.map(parseFilter) : undefined;
      await cmdCount(client, { doctype, filters });
      break;
    }

    case "search": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} search Project "query"`);
      const query = args.positional[1] ?? die(`Query required. Example: frappe-ctl ${args.app} search Project "V Builders"`);
      const field = args.flags["field"] ? String(args.flags["field"]) : undefined;
      const filters = args.filters.length ? args.filters.map(parseFilter) : undefined;
      const fields = args.flags["fields"]
        ? String(args.flags["fields"]).split(",").map((f) => f.trim())
        : undefined;
      const limit = args.flags["limit"] ? parseInt(String(args.flags["limit"]), 10) : 20;
      await cmdSearch(client, { doctype, query, field, filters, fields, limit, format: fmt, sparse, stripMeta });
      break;
    }

    case "describe": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} describe SalesOrder`);
      await cmdDescribe(client, {
        doctype,
        format: fmt,
        required: args.flags["required"] === true,
        compact: args.flags["compact"] === true,
        namesOnly: args.flags["names-only"] === true,
        relationships: args.flags["relationships"] === true,
      });
      break;
    }

    case "link": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} link "Sales Order" SO-001 project`);
      const name = args.positional[1] ?? die(`Name required.`);
      const fieldname = args.positional[2] ?? die(`Field name required. Example: frappe-ctl ${args.app} link "Sales Order" SO-001 project`);
      await cmdLink(client, { doctype, name, fieldname, format: fmt, sparse, stripMeta });
      break;
    }

    case "validate": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} validate "Purchase Order" --data '{...}'`);
      const raw = args.flags["data"] ?? die("--data required. Example: --data '{\"supplier\":\"Acme\"}'");
      let data: Record<string, unknown>;
      try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
      catch { die("--data must be valid JSON"); }
      await cmdValidate(client, { doctype, data });
      break;
    }

    case "diff": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} diff Project PROJ-001 --data '{...}'`);
      const name = args.positional[1] ?? die(`Name required.`);
      const raw = args.flags["data"] ?? die("--data required. Example: --data '{\"status\":\"Completed\"}'");
      let data: Record<string, unknown>;
      try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
      catch { die("--data must be valid JSON"); }
      await cmdDiff(client, { doctype, name, data });
      break;
    }

    case "create": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} create Customer --data '{...}'`);
      const raw = args.flags["data"] ?? die("--data required. Example: --data '{\"customer_name\":\"Acme\"}'");
      let data: Record<string, unknown>;
      try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
      catch { die("--data must be valid JSON"); }
      await cmdCreate(client, { doctype, data, format: fmt, dryRun: args.dryRun, sparse, stripMeta });
      break;
    }

    case "patch": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} patch SalesOrder SO-001 --data '{...}'`);
      const name = args.positional[1] ?? die(`Name required. Example: frappe-ctl ${args.app} patch SalesOrder SO-001 --data '{...}'`);
      const raw = args.flags["data"] ?? die("--data required. Example: --data '{\"status\":\"On Hold\"}'");
      let data: Record<string, unknown>;
      try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
      catch { die("--data must be valid JSON"); }
      await cmdPatch(client, { doctype, name, data, format: fmt, dryRun: args.dryRun, sparse, stripMeta });
      break;
    }

    case "delete": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} delete SalesOrder SO-001 --force`);
      const name = args.positional[1] ?? die(`Name required. Example: frappe-ctl ${args.app} delete SalesOrder SO-001 --force`);
      await cmdDelete(client, { doctype, name, force: args.flags["force"] === true, dryRun: args.dryRun });
      break;
    }

    case "submit": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} submit SalesOrder SO-001`);
      const name = args.positional[1] ?? die(`Name required. Example: frappe-ctl ${args.app} submit SalesOrder SO-001`);
      await cmdSubmit(client, { doctype, name, dryRun: args.dryRun });
      break;
    }

    case "cancel": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} cancel SalesOrder SO-001`);
      const name = args.positional[1] ?? die(`Name required. Example: frappe-ctl ${args.app} cancel SalesOrder SO-001`);
      await cmdCancel(client, { doctype, name, dryRun: args.dryRun });
      break;
    }

    case "call": {
      const method = args.positional[0] ?? die(`Method required. Example: frappe-ctl ${args.app} call frappe.client.get_list --data '{"doctype":"Customer"}'`);
      const raw = args.flags["data"];
      let data: Record<string, unknown> | undefined;
      if (raw) {
        try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
        catch { die("--data must be valid JSON"); }
      }
      await cmdCall(client, { method, data, format: fmt });
      break;
    }

    case "report": {
      const reportName = args.positional[0] ?? die(`Report name required. Example: frappe-ctl ${args.app} report "Accounts Receivable"`);
      const raw = args.flags["filter"] ?? args.flags["filters"];
      let filters: Record<string, unknown> = {};
      if (raw) {
        try { filters = JSON.parse(String(raw)) as Record<string, unknown>; }
        catch { die("--filter for report must be a JSON object: --filter '{\"company\":\"Acme\"}'"); }
      }
      await cmdReport(client, { reportName, filters, format: fmt, sparse });
      break;
    }

    case "resources": {
      await cmdResources(client, {
        appAlias: args.app!,
        format: fmt,
        compact: args.flags["compact"] === true,
        submittable: args.flags["submittable"] === true,
      });
      break;
    }

    case "apply": {
      const file = String(args.flags["file"] ?? die(`--file required. Example: frappe-ctl ${args.app} apply --file doc.json`));
      await cmdApply(client, { file, format: fmt, dryRun: args.dryRun, sparse, stripMeta });
      break;
    }

    case "logs": {
      const limit = args.flags["limit"] ? parseInt(String(args.flags["limit"]), 10) : 20;
      const method = args.flags["method"] ? String(args.flags["method"]) : undefined;
      const excludeRaw = args.flags["exclude-method"] ? String(args.flags["exclude-method"]) : undefined;
      const exclude = excludeRaw ? excludeRaw.split(",").map((s) => s.trim()) : undefined;
      const noDefaultExclude = args.flags["no-default-exclude"] === true;
      const since = args.flags["since"] ? String(args.flags["since"]) : undefined;
      const compact = args.flags["compact"] === true;
      await cmdLogs(client, { limit, method, exclude, noDefaultExclude, since, compact, format: fmt });
      break;
    }

    case "bulk": {
      const subVerb = (args.positional[0] ?? die(`Sub-verb required: patch or delete.\nExample: frappe-ctl ${args.app} bulk patch SalesOrder --filter "status=Draft" --data '{...}'`)) as "patch" | "delete";
      const doctype = args.positional[1] ?? die(`DocType required. Example: frappe-ctl ${args.app} bulk patch SalesOrder --filter "status=Draft"`);
      if (!args.filters.length) die(`--filter required for bulk. Example: --filter "status=Draft"`);
      const filters = args.filters.map(parseFilter);
      const raw = args.flags["data"];
      let data: Record<string, unknown> = {};
      if (raw) {
        try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
        catch { die("--data must be valid JSON"); }
      }
      await cmdBulk(client, {
        subVerb,
        doctype,
        filters,
        data,
        force: args.flags["force"] === true,
        dryRun: args.dryRun,
      });
      break;
    }

    case "workflow": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} workflow SalesOrder SO-001 --action "Approve"`);
      const name = args.positional[1] ?? die(`Name required. Example: frappe-ctl ${args.app} workflow SalesOrder SO-001 --action "Approve"`);
      const action = String(args.flags["action"] ?? die(`--action required. Example: --action "Approve"`));
      await cmdWorkflow(client, { doctype, name, action, dryRun: args.dryRun });
      break;
    }

    case "attach": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} attach SalesInvoice SINV-001 --file invoice.pdf`);
      const name = args.positional[1] ?? die(`Name required.`);
      const file = String(args.flags["file"] ?? die(`--file required.`));
      const isPrivate = args.flags["private"] === true;
      await cmdAttach(client, { doctype, name, file, isPrivate, dryRun: args.dryRun });
      break;
    }

    case "print": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} print SalesInvoice SINV-001`);
      const name = args.positional[1] ?? die(`Name required.`);
      const printFormat = args.flags["format"] ? String(args.flags["format"]) : undefined;
      const outFile = args.flags["output"] ? String(args.flags["output"]) : undefined;
      const noLetterhead = args.flags["no-letterhead"] === true;
      await cmdPrint(client, { doctype, name, printFormat, outFile, noLetterhead, dryRun: args.dryRun });
      break;
    }

    case "agent-context": {
      const doctypes = args.flags["doctypes"]
        ? String(args.flags["doctypes"]).split(",").map((s) => s.trim())
        : undefined;
      const includeCounts = args.flags["include-counts"] === true;
      const compact = args.flags["compact"] === true;
      await cmdAgentContext({ client, doctypes, includeCounts, compact, site: profile.url });
      break;
    }

    default: {
      const known = ["get", "count", "search", "describe", "link", "validate", "diff", "apply", "create", "patch", "delete", "bulk", "submit", "cancel", "call", "report", "resources", "logs", "workflow", "attach", "print", "agent-context"];
      die(`Unknown verb '${args.verb}'. Valid verbs: ${known.join(", ")}`);
    }
  }

  // Bun 1.3.x doesn't drain stdout before exit when piped — empty write with callback
  // blocks until the underlying stream flushes (fixes 64KB pipe truncation on large JSON)
  await new Promise<void>((resolve) => process.stdout.write("", resolve));
}

main().catch((err: unknown) => {
  if (err instanceof FrappeRequestError) {
    console.error(`error: ${err.message}`);
    if (err.serverMessage) console.error(`       ${err.serverMessage}`);
  } else {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
});
