import { FrappeClient, type FrappeFilter } from "../client.ts";
import { detectFormat, printDocs, type OutputFilterOpts } from "../output.ts";

interface SearchArgs {
  doctype: string;
  query: string;
  field?: string;         // --field: override which field to search
  filters?: FrappeFilter[];
  fields?: string[];
  limit?: number;
  format?: string;
  sparse?: boolean;
  stripMeta?: boolean;
}

// Common title fields ordered by precedence — used when DocType has no explicit title_field
const TITLE_FIELD_FALLBACKS = ["project_name", "customer_name", "supplier_name", "subject", "title", "full_name"];

export async function cmdSearch(client: FrappeClient, args: SearchArgs): Promise<void> {
  const fmt = detectFormat(args.format);
  const opts: OutputFilterOpts = { sparse: args.sparse, stripMeta: args.stripMeta };

  let searchField = args.field;

  if (!searchField) {
    // Fetch meta to determine title_field
    const meta = await client.getDocTypeMeta(args.doctype) as {
      title_field?: string;
      fields?: { fieldname: string }[];
    };
    if (meta.title_field) {
      searchField = meta.title_field;
    } else {
      // Check which fallback field exists on this DocType
      const fieldNames = new Set((meta.fields ?? []).map((f) => f.fieldname));
      searchField = TITLE_FIELD_FALLBACKS.find((f) => fieldNames.has(f)) ?? "name";
    }
  }

  const docs = await client.searchDocs(args.doctype, args.query, searchField, {
    filters: args.filters,
    fields: args.fields,
    limit: args.limit ?? 20,
  });

  printDocs(docs, fmt, opts);
}
