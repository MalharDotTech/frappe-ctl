import { readFileSync } from "fs";
import { FrappeClient } from "../client.ts";
import { detectFormat, printDoc, type OutputFilterOpts } from "../output.ts";

interface ApplyArgs {
  file: string;       // path to JSON file, or "-" for stdin
  format?: string;
  dryRun?: boolean;
  sparse?: boolean;
  stripMeta?: boolean;
}

export async function cmdApply(client: FrappeClient, args: ApplyArgs): Promise<void> {
  let raw: string;
  if (args.file === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    raw = Buffer.concat(chunks).toString("utf8");
  } else {
    raw = readFileSync(args.file, "utf8");
  }

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON in ${args.file}`);
  }

  const doctype = doc["doctype"];
  if (!doctype || typeof doctype !== "string") {
    throw new Error(`File must include a "doctype" field. Got: ${JSON.stringify(Object.keys(doc))}`);
  }

  const name = doc["name"];
  const isUpdate = typeof name === "string" && name.length > 0;

  if (args.dryRun) {
    const action = isUpdate ? `update ${doctype} ${name}` : `create ${doctype}`;
    console.log(`[DRY RUN] Would ${action}:`);
    process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
    return;
  }

  const result = isUpdate
    ? await client.updateDoc(doctype, name as string, doc)
    : await client.createDoc(doctype, doc);

  const opts: OutputFilterOpts = { sparse: args.sparse, stripMeta: args.stripMeta };
  printDoc(result, detectFormat(args.format), opts);
}
