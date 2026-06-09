#!/usr/bin/env bun
import { FrappeClient } from "./client.ts";
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
import { cmdAttach } from "./commands/attach.ts";
import { cmdPrint } from "./commands/print.ts";

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

APPS
${Object.values(APPS).map((a) => `  ${a.alias.padEnd(10)} ${a.name}`).join("\n")}

VERBS
  get        List or fetch docs            frappe-ctl next get SalesOrder [name]
  describe   DocType schema + fields       frappe-ctl next describe SalesOrder
  apply      Create or update from file    frappe-ctl next apply -f doc.json
  create     Create a new doc              frappe-ctl next create SalesOrder --data '{...}'
  patch      Update fields on a doc        frappe-ctl next patch SalesOrder SO-001 --data '{...}'
  delete     Delete a doc (needs --force)  frappe-ctl next delete SalesOrder SO-001 --force
  submit     Submit (docstatus 0→1)        frappe-ctl next submit SalesOrder SO-001
  cancel     Cancel (docstatus 1→2)        frappe-ctl next cancel SalesOrder SO-001
  call       Call any whitelisted method   frappe-ctl next call frappe.client.get_list --data '{...}'
  report     Run a saved ERPNext Report    frappe-ctl next report "Project Billing Summary"
  resources  List all DocTypes for app     frappe-ctl next resources
  logs       Tail Frappe error log         frappe-ctl next logs [--limit 20] [--method submit]
  workflow   Apply workflow action         frappe-ctl next workflow SalesOrder SO-001 --action "Approve"
  attach     Upload file to a doc         frappe-ctl next attach SalesInvoice SINV-001 --file invoice.pdf
  print      Download PDF (print format)  frappe-ctl next print SalesInvoice SINV-001 --output invoice.pdf
  agent-context  Machine-readable schema (for LLM tool registration)

FLAGS
  --site <profile>              Override active profile
  --filter "field=value"        Filter (repeatable, get only)
  --fields name,status,...      Fields to return (default: all)
  --limit <n>                   Max results (default: 20)
  --data '{"field":"value"}'    JSON payload (create/patch)
  --force                       Skip confirmation (delete)
  --dry-run                     Show what would happen, no writes
  -o, --output json|table|csv   Output format

ENV
  FRAPPE_CTL_READONLY=1         Block all mutations (safe for read-only agents)
  FRAPPE_CTL_CONFIG_DIR         Override config directory

EXAMPLES
  frappe-ctl next get Customer
  frappe-ctl next get SalesOrder SO-2024-0001
  frappe-ctl next get SalesOrder --filter "status=Open" --limit 50
  frappe-ctl next describe SalesOrder
  frappe-ctl next create Customer --data '{"customer_name":"Acme","customer_type":"Company"}'
  frappe-ctl next patch SalesOrder SO-001 --data '{"status":"On Hold"}'
  frappe-ctl next delete SalesOrder SO-001 --force
  frappe-ctl next submit SalesOrder SO-001
  frappe-ctl next cancel SalesOrder SO-001

PROFILE MANAGEMENT
  frappe-ctl profile add uat --url http://localhost:8080 --key abc --secret xyz
  frappe-ctl profile use prod
  frappe-ctl profile list
  frappe-ctl profile remove uat
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

  // agent-context — no app/site context needed
  if (argv[0] === "agent-context") {
    await cmdAgentContext();
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
        const key = String(parsed.flags["key"] ?? die("--key required"));
        const secret = String(parsed.flags["secret"] ?? die("--secret required"));
        // --app-version next=v16 (repeatable) → { next: "v16" }
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

  const client = new FrappeClient({
    url: profile.url,
    apiKey: profile.api_key,
    apiSecret: profile.api_secret,
  });

  const MUTATION_VERBS = ["create", "patch", "delete", "submit", "cancel", "call", "apply", "workflow", "attach"];
  const readonly = process.env["FRAPPE_CTL_READONLY"] === "1";

  if (readonly && MUTATION_VERBS.includes(args.verb!)) {
    die(
      `Mutation blocked: FRAPPE_CTL_READONLY=1 is set.\n` +
      `Read-only verbs allowed: get, describe, report, resources.\n` +
      `Unset FRAPPE_CTL_READONLY to allow writes.`,
    );
  }

  const fmt = args.flags["output"] ? String(args.flags["output"]) : undefined;

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

      await cmdGet(client, { doctype, name, filters, fields, limit, format: fmt });
      break;
    }

    case "describe": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} describe SalesOrder`);
      await cmdDescribe(client, { doctype, format: fmt });
      break;
    }

    case "create": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} create Customer --data '{...}'`);
      const raw = args.flags["data"] ?? die("--data required. Example: --data '{\"customer_name\":\"Acme\"}'");
      let data: Record<string, unknown>;
      try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
      catch { die("--data must be valid JSON"); }
      await cmdCreate(client, { doctype, data, format: fmt, dryRun: args.dryRun });
      break;
    }

    case "patch": {
      const doctype = args.positional[0] ?? die(`DocType required. Example: frappe-ctl ${args.app} patch SalesOrder SO-001 --data '{...}'`);
      const name = args.positional[1] ?? die(`Name required. Example: frappe-ctl ${args.app} patch SalesOrder SO-001 --data '{...}'`);
      const raw = args.flags["data"] ?? die("--data required. Example: --data '{\"status\":\"On Hold\"}'");
      let data: Record<string, unknown>;
      try { data = JSON.parse(String(raw)) as Record<string, unknown>; }
      catch { die("--data must be valid JSON"); }
      await cmdPatch(client, { doctype, name, data, format: fmt, dryRun: args.dryRun });
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
      await cmdReport(client, { reportName, filters, format: fmt });
      break;
    }

    case "resources": {
      await cmdResources(client, { appAlias: args.app!, format: fmt });
      break;
    }

    case "apply": {
      const file = String(args.flags["file"] ?? die(`--file required. Example: frappe-ctl ${args.app} apply --file doc.json`));
      await cmdApply(client, { file, format: fmt, dryRun: args.dryRun });
      break;
    }

    case "logs": {
      const limit = args.flags["limit"] ? parseInt(String(args.flags["limit"]), 10) : 20;
      const method = args.flags["method"] ? String(args.flags["method"]) : undefined;
      await cmdLogs(client, { limit, method, format: fmt });
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

    default: {
      const known = ["get", "describe", "apply", "create", "patch", "delete", "submit", "cancel", "call", "report", "resources", "logs", "workflow", "attach", "print"];
      die(`Unknown verb '${args.verb}'. Valid verbs: ${known.join(", ")}`);
    }
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`error: ${msg}`);
  process.exit(1);
});
