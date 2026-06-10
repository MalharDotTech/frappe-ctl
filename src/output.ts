export type OutputFormat = "json" | "table" | "csv";

const META_FIELDS = new Set([
  "owner", "modified_by", "creation", "modified", "idx", "_assign", "_comments",
  "_liked_by", "_user_tags", "naming_series", "doctype", "amended_from",
  "letter_head", "select_print_heading", "language", "auto_repeat",
  "from_date", "to_date", "utm_source", "utm_medium", "utm_campaign", "utm_content",
]);

// Fields where 0 is meaningful — don't strip in sparse mode
const KEEP_ZERO = new Set([
  "docstatus", "idx", "qty", "rate", "amount", "grand_total",
  "net_total", "total", "per_billed", "per_delivered", "percent_complete",
]);

export function sparseDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(doc).filter(([k, v]) => {
      if (v === null || v === undefined || v === "") return false;
      if (v === 0 && !KEEP_ZERO.has(k)) return false;
      return true;
    }),
  );
}

export function stripMetaDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([k]) => !META_FIELDS.has(k)));
}

export interface OutputFilterOpts {
  sparse?: boolean;
  stripMeta?: boolean;
}

export function applyOutputFilters(
  doc: Record<string, unknown>,
  opts: OutputFilterOpts,
): Record<string, unknown> {
  let result = doc;
  if (opts.stripMeta) result = stripMetaDoc(result);
  if (opts.sparse) result = sparseDoc(result);
  return result;
}

export function detectFormat(flag?: string): OutputFormat {
  if (flag === "json") return "json";
  if (flag === "csv") return "csv";
  if (flag === "table") return "table";
  return process.stdout.isTTY ? "table" : "json";
}

export function printDocs(
  docs: Record<string, unknown>[],
  format: OutputFormat,
  opts: OutputFilterOpts = {},
): void {
  const processed = (opts.sparse || opts.stripMeta)
    ? docs.map((d) => applyOutputFilters(d, opts))
    : docs;

  if (!processed.length) {
    if (format !== "json") {
      console.log("No results.");
    } else {
      process.stdout.write("[]\n");
    }
    return;
  }

  switch (format) {
    case "json":
      process.stdout.write(JSON.stringify(processed, null, 2) + "\n");
      break;
    case "csv":
      printCsv(processed);
      break;
    case "table":
      printTable(processed);
      break;
  }
}

export function printDoc(
  doc: Record<string, unknown>,
  format: OutputFormat,
  opts: OutputFilterOpts = {},
): void {
  const processed = (opts.sparse || opts.stripMeta) ? applyOutputFilters(doc, opts) : doc;

  switch (format) {
    case "json":
      process.stdout.write(JSON.stringify(processed, null, 2) + "\n");
      break;
    case "csv":
      printCsv([processed]);
      break;
    case "table":
      for (const [k, v] of Object.entries(processed)) {
        if (v === null || v === undefined || v === "") continue;
        const val = typeof v === "object" ? JSON.stringify(v) : String(v);
        console.log(`${k.padEnd(30)} ${val}`);
      }
      break;
  }
}

function printTable(docs: Record<string, unknown>[]): void {
  const keys = Object.keys(docs[0]!);
  const widths = keys.map((k) =>
    Math.min(
      40,
      Math.max(
        k.length,
        ...docs.map((d) => String(d[k] ?? "").length),
      ),
    ),
  );

  const row = (vals: string[]) =>
    vals.map((v, i) => v.slice(0, widths[i]!).padEnd(widths[i]!)).join("  ");

  console.log(row(keys));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const doc of docs) {
    console.log(row(keys.map((k) => String(doc[k] ?? ""))));
  }
}

function printCsv(docs: Record<string, unknown>[]): void {
  const keys = Object.keys(docs[0]!);
  const escape = (v: unknown) => {
    const s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  console.log(keys.join(","));
  for (const doc of docs) {
    console.log(keys.map((k) => escape(doc[k])).join(","));
  }
}
