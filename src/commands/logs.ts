import { FrappeClient, type FrappeFilter } from "../client.ts";

// Background noise from Frappe scheduler — excluded by default so useful errors are visible
const DEFAULT_EXCLUDE = ["raven", "sync_invalid_tokens"];

interface LogsArgs {
  limit?: number;
  method?: string;            // --method: include only entries whose method contains this
  exclude?: string[];         // --exclude-method: skip entries whose method contains any of these
  noDefaultExclude?: boolean; // --no-default-exclude: show everything including Raven noise
  since?: string;             // --since YYYY-MM-DD: only entries created after this date
  compact?: boolean;          // --compact: omit error traceback (name/creation/method only)
  format?: string;
}

export async function cmdLogs(client: FrappeClient, args: LogsArgs): Promise<void> {
  const filters: FrappeFilter[] = [];
  if (args.method) {
    filters.push(["method", "like", `%${args.method}%`]);
  }
  if (args.since) {
    filters.push(["creation", ">=", args.since]);
  }

  const userLimit = args.limit ?? 20;
  const excludePatterns = args.noDefaultExclude
    ? (args.exclude ?? [])
    : [...DEFAULT_EXCLUDE, ...(args.exclude ?? [])];

  const fetchLimit = excludePatterns.length ? userLimit * 3 : userLimit;

  // --compact omits error traceback — saves ~3KB per entry in JSON output
  const fields = args.compact
    ? ["name", "method", "creation"]
    : ["name", "method", "error", "creation"];

  const docs = await client.listDocs("Error Log", {
    filters,
    fields,
    limit: fetchLimit,
    orderBy: "creation desc",
  });

  const filtered = (excludePatterns.length
    ? docs.filter((d) => {
        const m = String(d["method"] ?? "").toLowerCase();
        return !excludePatterns.some((p) => m.includes(p.toLowerCase()));
      })
    : docs
  ).slice(0, userLimit);

  const skipped = docs.length - filtered.length;

  if (skipped > 0) {
    process.stderr.write(
      `(${skipped} entries hidden by default exclude filter — use --no-default-exclude to show all)\n`,
    );
  }

  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

  if (fmt === "json") {
    process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
    return;
  }

  if (!filtered.length) {
    console.log(`No error logs found.`);
    return;
  }

  if (fmt === "table") {
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
