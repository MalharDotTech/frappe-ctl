import { FrappeClient, type ReportResult } from "../client.ts";

interface ReportArgs {
  reportName: string;
  filters: Record<string, unknown>;
  format?: string;
}

export async function cmdReport(client: FrappeClient, args: ReportArgs): Promise<void> {
  const result: ReportResult = await client.runReport(args.reportName, args.filters);
  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

  if (fmt === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  const { columns, result: rows } = result;

  if (!rows.length) {
    console.log("No results.");
    return;
  }

  if (fmt === "table") {
    const labels = columns.map((c) => c.label);
    const widths = labels.map((l, i) =>
      Math.min(40, Math.max(l.length, ...rows.map((r) => String(r[i] ?? "").length))),
    );
    const rowLine = (vals: string[]) =>
      vals.map((v, i) => v.slice(0, widths[i]!).padEnd(widths[i]!)).join("  ");

    console.log(rowLine(labels));
    console.log(widths.map((w) => "-".repeat(w)).join("  "));
    for (const row of rows) {
      console.log(rowLine(row.map((v) => String(v ?? ""))));
    }
    return;
  }

  // csv
  console.log(columns.map((c) => c.label).join(","));
  for (const row of rows) {
    console.log(row.map((v) => String(v ?? "")).join(","));
  }
}
