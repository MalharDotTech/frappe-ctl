import { FrappeClient, type ReportResult, type ReportColumn } from "../client.ts";

interface ReportArgs {
  reportName: string;
  filters: Record<string, unknown>;
  format?: string;
  sparse?: boolean;  // --sparse: output objects keyed by fieldname, null/empty stripped
}

function rowsToObjects(
  columns: ReportColumn[],
  rows: unknown[][],
  sparse: boolean,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!;
      const val = row[i] ?? null;
      if (sparse && (val === null || val === undefined || val === "")) continue;
      obj[col.fieldname] = val;
    }
    return obj;
  });
}

export async function cmdReport(client: FrappeClient, args: ReportArgs): Promise<void> {
  const result: ReportResult = await client.runReport(args.reportName, args.filters);
  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

  if (fmt === "json") {
    if (args.sparse) {
      // Convert to keyed objects with null/empty stripped — agents can navigate by fieldname
      const objects = rowsToObjects(result.columns, result.result, true);
      process.stdout.write(JSON.stringify(objects, null, 2) + "\n");
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
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
