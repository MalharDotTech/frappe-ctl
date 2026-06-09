import { FrappeClient, type FrappeFilter } from "../client.ts";

// Background noise from Frappe scheduler — excluded by default so useful errors are visible
const DEFAULT_EXCLUDE = ["raven", "sync_invalid_tokens"];

interface LogsArgs {
  limit?: number;
  method?: string;          // --method: include only entries whose method contains this
  exclude?: string[];       // --exclude-method: skip entries whose method contains any of these
  noDefaultExclude?: boolean; // --no-default-exclude: show everything including Raven noise
  format?: string;
}

export async function cmdLogs(client: FrappeClient, args: LogsArgs): Promise<void> {
  const filters: FrappeFilter[] = [];
  if (args.method) {
    filters.push(["method", "like", `%${args.method}%`]);
  }

  const docs = await client.listDocs("Error Log", {
    filters,
    fields: ["name", "method", "error", "creation"],
    limit: args.limit ?? 20,
    orderBy: "creation desc",
  });

  // Client-side exclude filter — Frappe's `not like` with multiple values needs OR logic
  const excludePatterns = args.noDefaultExclude
    ? (args.exclude ?? [])
    : [...DEFAULT_EXCLUDE, ...(args.exclude ?? [])];

  const filtered = excludePatterns.length
    ? docs.filter((d) => {
        const m = String(d["method"] ?? "").toLowerCase();
        return !excludePatterns.some((p) => m.includes(p.toLowerCase()));
      })
    : docs;

  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

  if (fmt === "json") {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (!filtered.length) {
    const skipped = docs.length - filtered.length;
    console.log(`No error logs found.${skipped ? ` (${skipped} excluded by default filter — use --no-default-exclude to show)` : ""}`);
    return;
  }

  if (fmt === "table") {
    const skipped = docs.length - filtered.length;
    if (skipped) console.log(`(${skipped} entries hidden by default exclude filter — use --no-default-exclude to show all)\n`);
    const header = `${"NAME".padEnd(12)} ${"CREATION".padEnd(20)} METHOD`;
    console.log(header);
    console.log("-".repeat(72));
    for (const d of filtered) {
      const name = String(d["name"] ?? "").padEnd(12);
      const creation = String(d["creation"] ?? "").slice(0, 19).padEnd(20);
      const method = String(d["method"] ?? "").slice(0, 50);
      console.log(`${name} ${creation} ${method}`);
    }
    return;
  }

  // csv
  console.log("name,creation,method,error");
  for (const d of filtered) {
    const error = String(d["error"] ?? "").replace(/\n/g, " ").slice(0, 100);
    console.log(`${d["name"]},${d["creation"]},${d["method"]},"${error}"`);
  }
}
