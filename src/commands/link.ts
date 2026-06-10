import { FrappeClient } from "../client.ts";
import { detectFormat, printDoc, type OutputFilterOpts } from "../output.ts";

interface LinkArgs {
  doctype: string;
  name: string;
  fieldname: string;
  format?: string;
  sparse?: boolean;
  stripMeta?: boolean;
}

export async function cmdLink(client: FrappeClient, args: LinkArgs): Promise<void> {
  const doc = await client.getDoc(args.doctype, args.name);
  const linkedValue = doc[args.fieldname];

  if (linkedValue === null || linkedValue === undefined || linkedValue === "") {
    throw new Error(`Field '${args.fieldname}' is empty on ${args.doctype} '${args.name}'`);
  }

  // Fetch DocType meta to resolve the linked DocType name from field options
  const meta = await client.getDocTypeMeta(args.doctype) as {
    fields?: { fieldname: string; fieldtype: string; options?: string }[];
  };

  const field = (meta.fields ?? []).find((f) => f.fieldname === args.fieldname);
  if (!field || field.fieldtype !== "Link" || !field.options) {
    throw new Error(`Field '${args.fieldname}' is not a Link field on ${args.doctype}`);
  }

  const linkedDoc = await client.getDoc(field.options, String(linkedValue));
  const fmt = detectFormat(args.format);
  const opts: OutputFilterOpts = { sparse: args.sparse, stripMeta: args.stripMeta };
  printDoc(linkedDoc, fmt, opts);
}
