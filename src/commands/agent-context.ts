import { APPS } from "../apps.ts";

// Bump when verbs, flags, or auth shape changes — agents use this to invalidate cached schemas
const SCHEMA_VERSION = "2";

const VERBS = [
  {
    name: "get",
    description: "List docs or fetch one by name",
    readonly_safe: true,
    flags: ["--filter field=value (repeatable)", "--fields name,status,...", "--limit n (default 20)", "-o json|table|csv"],
    example: "frappe-ctl next get SalesOrder --filter \"status=Open\" --limit 20",
  },
  {
    name: "describe",
    description: "Show DocType schema: field names, types, required flags",
    readonly_safe: true,
    flags: ["-o json|table"],
    example: "frappe-ctl next describe SalesOrder",
  },
  {
    name: "apply",
    description: "Create or update a doc from a JSON file (or stdin via -). doc has name → PUT update; no name → POST create.",
    readonly_safe: false,
    flags: ["--file <path|-> (required)", "--dry-run", "-o json|table"],
    example: "frappe-ctl next apply --file customer.json",
  },
  {
    name: "create",
    description: "Create a new doc. Returns the created doc.",
    readonly_safe: false,
    flags: ["--data '{\"field\":\"value\"}' (required)", "--dry-run", "-o json|table"],
    example: "frappe-ctl next create Customer --data '{\"customer_name\":\"Acme\",\"customer_type\":\"Company\"}'",
  },
  {
    name: "patch",
    description: "Update fields on an existing doc. Returns updated doc.",
    readonly_safe: false,
    flags: ["--data '{\"field\":\"value\"}' (required)", "--dry-run", "-o json|table"],
    example: "frappe-ctl next patch SalesOrder SO-001 --data '{\"status\":\"On Hold\"}'",
  },
  {
    name: "delete",
    description: "Delete a doc. Requires --force — no silent deletion ever.",
    readonly_safe: false,
    flags: ["--force (required)", "--dry-run"],
    example: "frappe-ctl next delete Customer CUST-001 --force",
  },
  {
    name: "submit",
    description: "Submit a doc: docstatus 0 (Draft) → 1 (Submitted). ERPNext only.",
    readonly_safe: false,
    flags: ["--dry-run"],
    example: "frappe-ctl next submit SalesOrder SO-001",
  },
  {
    name: "cancel",
    description: "Cancel a submitted doc: docstatus 1 → 2 (Cancelled). ERPNext only.",
    readonly_safe: false,
    flags: ["--dry-run"],
    example: "frappe-ctl next cancel SalesOrder SO-001",
  },
  {
    name: "workflow",
    description: "Apply an ERPNext workflow action (approve/reject/etc). Uses frappe.model.workflow.apply_workflow.",
    readonly_safe: false,
    flags: ["--action <action_name> (required)", "--dry-run"],
    example: "frappe-ctl next workflow \"Leave Application\" LA-001 --action \"Approve\"",
  },
  {
    name: "attach",
    description: "Upload a local file to a doc as an attachment. Returns file_url.",
    readonly_safe: false,
    flags: ["--file <path> (required)", "--private (mark file private)", "--dry-run"],
    example: "frappe-ctl next attach \"Sales Invoice\" SINV-001 --file invoice.pdf",
  },
  {
    name: "print",
    description: "Download a doc as PDF via Frappe print format. Writes to file or streams to stdout.",
    readonly_safe: true,
    flags: ["--format <print_format_name>", "--output <path> (default: stdout)", "--no-letterhead"],
    example: "frappe-ctl next print \"Sales Invoice\" SINV-001 --output sinv.pdf",
  },
  {
    name: "bulk",
    description: "Patch or delete all docs matching a filter. Paginated via listAll (100/page). Partial-failure tolerant — outputs {total,success,failed,errors[]}.",
    readonly_safe: false,
    flags: ["patch|delete (sub-verb, required)", "--filter field=value (required, repeatable)", "--data '{...}' (required for patch)", "--force (required for delete)", "--dry-run"],
    example: "frappe-ctl next bulk patch SalesOrder --filter \"status=Draft\" --data '{\"status\":\"Cancelled\"}' --dry-run",
  },
  {
    name: "call",
    description: "Call any whitelisted Frappe method by dotted path.",
    readonly_safe: false,
    flags: ["--data '{...}' (optional JSON payload)", "-o json|table"],
    example: "frappe-ctl frappe call frappe.client.get_count --data '{\"doctype\":\"User\"}'",
  },
  {
    name: "report",
    description: "Run a saved Frappe Report by exact name.",
    readonly_safe: true,
    flags: ["--filter '{\"company\":\"Acme\"}' (JSON object)", "-o json|table|csv"],
    example: "frappe-ctl next report \"Accounts Receivable\" --filter '{\"company\":\"My Co\"}'",
  },
  {
    name: "resources",
    description: "List all DocTypes available for an app, with module and submittable flag.",
    readonly_safe: true,
    flags: ["-o json|table|csv"],
    example: "frappe-ctl next resources",
  },
  {
    name: "logs",
    description: "Tail Frappe Error Log — most recent entries first.",
    readonly_safe: true,
    flags: ["--limit n (default 20)", "--method <substring> filter by method name", "-o json|table|csv"],
    example: "frappe-ctl next logs --limit 50 --method submit",
  },
];

const GLOBAL_FLAGS = [
  { flag: "--site <profile>", description: "Override the active profile for this command" },
  { flag: "--dry-run", description: "Print what would happen without making any writes" },
  { flag: "-o json|table|csv", description: "Output format. Default: table in TTY, json when piped" },
];

export async function cmdAgentContext(): Promise<void> {
  const apps = Object.values(APPS).map((a) => ({
    alias: a.alias,
    name: a.name,
    description: a.description,
    current_stable: a.currentStable,
    supported_versions: a.supportedVersions,
    modules: a.modules,
  }));

  const context = {
    schema_version: SCHEMA_VERSION,
    cli: "frappe-ctl",
    grammar: "frappe-ctl [--site <profile>] <app> <verb> <DocType> [name] [flags]",
    auth: {
      self_hosted: "Authorization: token <api_key>:<api_secret> — NOT Bearer, NOT Basic",
      frappe_cloud: "Authorization: Bearer <access_token> — obtained via PKCE OAuth flow (auth login)",
      auto_refresh: "Expired OAuth tokens are silently refreshed before each command using the stored refresh_token",
    },
    env_vars: {
      FRAPPE_CTL_READONLY: "Set to '1' to block all mutations — safe mode for read-only agents",
      FRAPPE_CTL_CONFIG_DIR: "Override config file location (default: ~/.config/frappe-ctl)",
      FRAPPE_CTL_NO_KEYCHAIN: "Set to '1' to skip OS keychain and use file-only token storage (CI / sandboxed envs)",
    },
    apps,
    verbs: VERBS,
    global_flags: GLOBAL_FLAGS,
    profile_commands: [
      "frappe-ctl profile add <name> --url <url> --key <k> --secret <s>",
      "frappe-ctl profile use <name>",
      "frappe-ctl profile list",
      "frappe-ctl profile remove <name>",
    ],
    auth_commands: [
      "frappe-ctl auth login [--site <profile>] --client-id <id>   # PKCE browser flow, stores token",
      "frappe-ctl auth logout [--site <profile>]                    # revoke + delete local token",
      "frappe-ctl auth status [--site <profile>]                    # show token expiry + auth method",
    ],
  };

  console.log(JSON.stringify(context, null, 2));
}
