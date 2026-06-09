import { FrappeClient, type FrappeFilter } from "../client.ts";

interface LogsArgs {
  limit?: number;
  method?: string;   // filter by method substring
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

  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

  if (fmt === "json") {
    console.log(JSON.stringify(docs, null, 2));
    return;
  }

  if (!docs.length) {
    console.log("No error logs found.");
    return;
  }

  if (fmt === "table") {
    const header = `${"NAME".padEnd(12)} ${"CREATION".padEnd(20)} METHOD`;
    console.log(header);
    console.log("-".repeat(72));
    for (const d of docs) {
      const name = String(d["name"] ?? "").padEnd(12);
      const creation = String(d["creation"] ?? "").slice(0, 19).padEnd(20);
      const method = String(d["method"] ?? "").slice(0, 50);
      console.log(`${name} ${creation} ${method}`);
    }
    return;
  }

  // csv
  console.log("name,creation,method,error");
  for (const d of docs) {
    const error = String(d["error"] ?? "").replace(/\n/g, " ").slice(0, 100);
    console.log(`${d["name"]},${d["creation"]},${d["method"]},"${error}"`);
  }
}
