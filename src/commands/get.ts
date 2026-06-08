import { FrappeClient, type FrappeFilter } from "../client.ts";
import { detectFormat, printDoc, printDocs } from "../output.ts";

interface GetArgs {
  doctype: string;
  name?: string;
  filters: FrappeFilter[];
  fields?: string[];
  limit: number;
  format?: string;
}

export async function cmdGet(client: FrappeClient, args: GetArgs): Promise<void> {
  const fmt = detectFormat(args.format);

  if (args.name) {
    const doc = await client.getDoc(args.doctype, args.name);
    printDoc(doc, fmt);
  } else {
    const docs = await client.listDocs(args.doctype, {
      filters: args.filters,
      fields: args.fields,
      limit: args.limit,
    });
    printDocs(docs, fmt);
  }
}

// Parse --filter "status=Open" or "status!=Open" or "date>=2024-01-01"
const FILTER_RE = /^([^=!<>]+)(!=|>=|<=|>|<|=)(.+)$/;

export function parseFilter(raw: string): FrappeFilter {
  const m = FILTER_RE.exec(raw.trim());
  if (!m) throw new Error(`Invalid filter '${raw}'. Use: field=value, field!=value, field>=value`);
  return [m[1]!.trim(), m[2]!.trim(), m[3]!.trim()];
}
