import { FrappeClient } from "../client.ts";
import { resolveApp } from "../apps.ts";

interface ResourcesArgs {
  appAlias: string;
  format?: string;
}

export async function cmdResources(client: FrappeClient, args: ResourcesArgs): Promise<void> {
  const app = resolveApp(args.appAlias);
  const docs = await client.listDocTypes(app.modules);
  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

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
