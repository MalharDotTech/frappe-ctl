export type OutputFormat = "json" | "table" | "csv";

export function detectFormat(flag?: string): OutputFormat {
  if (flag === "json") return "json";
  if (flag === "csv") return "csv";
  if (flag === "table") return "table";
  // Default: table when TTY (human), json when piped (agent)
  return process.stdout.isTTY ? "table" : "json";
}

export function printDocs(docs: Record<string, unknown>[], format: OutputFormat): void {
  if (!docs.length) {
    if (format !== "json") {
      console.log("No results.");
    } else {
      console.log("[]");
    }
    return;
  }

  switch (format) {
    case "json":
      console.log(JSON.stringify(docs, null, 2));
      break;
    case "csv":
      printCsv(docs);
      break;
    case "table":
      printTable(docs);
      break;
  }
}

export function printDoc(doc: Record<string, unknown>, format: OutputFormat): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(doc, null, 2));
      break;
    case "csv":
      printCsv([doc]);
      break;
    case "table":
      // Single doc: key-value layout
      for (const [k, v] of Object.entries(doc)) {
        if (v === null || v === undefined || v === "") continue;
        const val = typeof v === "object" ? JSON.stringify(v) : String(v);
        console.log(`${k.padEnd(30)} ${val}`);
      }
      break;
  }
}

function printTable(docs: Record<string, unknown>[]): void {
  const keys = Object.keys(docs[0]!);
  // Compute column widths
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
