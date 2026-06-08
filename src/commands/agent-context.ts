import { APPS } from "../apps.ts";

const SCHEMA_VERSION = "1";

const VERBS = [
  {
    name: "get",
    description: "List docs or fetch one by name",
    readonly_safe: true,
    flags: ["--filter field=value (repeatable)", "--fields name,status,...", "--limit n", "-o json|table|csv"],
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
    description: "Delete a doc. Requires --force to prevent accidental deletion.",
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
    auth: "token api_key:api_secret (header: Authorization: token key:secret)",
    readonly_env: "Set FRAPPE_CTL_READONLY=1 to block all mutations",
    config_env: "Set FRAPPE_CTL_CONFIG_DIR to override config location (~/.config/frappe-ctl)",
    apps,
    verbs: VERBS,
    global_flags: GLOBAL_FLAGS,
    profile_commands: [
      "frappe-ctl profile add <name> --url <url> --key <k> --secret <s>",
      "frappe-ctl profile use <name>",
      "frappe-ctl profile list",
      "frappe-ctl profile remove <name>",
    ],
  };

  console.log(JSON.stringify(context, null, 2));
}
