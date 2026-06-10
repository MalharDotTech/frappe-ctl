import { FrappeClient } from "../client.ts";
import { resolveApp } from "../apps.ts";

interface ResourcesArgs {
  appAlias: string;
  format?: string;
  compact?: boolean;      // --compact: return name array only
  submittable?: boolean;  // --submittable: filter to is_submittable=1 only
}

export async function cmdResources(client: FrappeClient, args: ResourcesArgs): Promise<void> {
  const app = resolveApp(args.appAlias);
  let docs = await client.listDocTypes(app.modules);
  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

  if (args.submittable) {
    docs = docs.filter((d) => d["is_submittable"]);
  }

  if (args.compact) {
    const names = docs.map((d) => String(d["name"] ?? ""));
    if (fmt === "json") {
      process.stdout.write(JSON.stringify(names, null, 2) + "\n");
    } else {
      console.log(names.join("\n"));
    }
    return;
  }

  if (fmt === "json") {
    process.stdout.write(JSON.stringify(docs, null, 2) + "\n");
    return;
  }

  if (!docs.length) {
    console.log(`No DocTypes found for app '${args.appAlias}'. Check that the app is installed.`);
    return;
  }

  if (fmt === "table") {
    const header = `${"NAME".padEnd(40)} ${"MODULE".padEnd(25)} SUBMIT`;
    console.log(header);
    console.log("-".repeat(header.length));
    for (const d of docs) {
      const submittable = d["is_submittable"] ? "yes" : "no";
      console.log(
        `${String(d["name"] ?? "").padEnd(40)} ${String(d["module"] ?? "").padEnd(25)} ${submittable}`,
      );
    }
    return;
  }

  // csv
  console.log("name,module,is_submittable");
  for (const d of docs) {
    console.log(`${d["name"]},${d["module"]},${d["is_submittable"] ? 1 : 0}`);
  }
}
