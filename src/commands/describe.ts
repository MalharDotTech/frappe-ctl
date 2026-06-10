import { FrappeClient } from "../client.ts";
import { type OutputFormat } from "../output.ts";

interface DescribeArgs {
  doctype: string;
  format?: string;
  required?: boolean;    // --required: reqd fields only
  compact?: boolean;     // --compact: fieldname/fieldtype/label/reqd + options for Link types only
  namesOnly?: boolean;   // --names-only: just fieldname list
  relationships?: boolean; // --relationships: Link/Table fields only (entity relationship map)
}

interface FrappeField {
  fieldname: string;
  fieldtype: string;
  label: string;
  reqd: number;
  options?: string | null;
}

const SECTION_TYPES = new Set(["Section Break", "Column Break", "Tab Break"]);
const LINK_TYPES = new Set(["Link", "Select", "Table", "Table MultiSelect"]);

export async function cmdDescribe(client: FrappeClient, args: DescribeArgs): Promise<void> {
  const meta = await client.getDocTypeMeta(args.doctype) as {
    name: string;
    module?: string;
    is_submittable?: number;
    fields?: FrappeField[];
  };

  const fmt: OutputFormat = (args.format === "json" || args.format === "csv" || args.format === "table")
    ? args.format
    : process.stdout.isTTY ? "table" : "json";

  let fields = (meta.fields ?? []).filter((f) => !SECTION_TYPES.has(f.fieldtype));

  if (args.required) fields = fields.filter((f) => f.reqd === 1);

  if (args.relationships) {
    const relFields = fields
      .filter((f) => f.fieldtype === "Link" || f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect")
      .map((f) => ({ fieldname: f.fieldname, fieldtype: f.fieldtype, label: f.label, options: f.options ?? null }));

    if (fmt === "json") {
      process.stdout.write(JSON.stringify(relFields, null, 2) + "\n");
      return;
    }
    const header = `${"FIELDNAME".padEnd(30)} ${"FIELDTYPE".padEnd(20)} ${"LABEL".padEnd(30)} TARGET_DOCTYPE`;
    console.log(header);
    console.log("-".repeat(header.length));
    for (const f of relFields) {
      console.log(`${f.fieldname.padEnd(30)} ${f.fieldtype.padEnd(20)} ${(f.label ?? "").padEnd(30)} ${f.options ?? ""}`);
    }
    return;
  }

  if (args.namesOnly) {
    const names = fields.map((f) => f.fieldname);
    if (fmt === "json") {
      process.stdout.write(JSON.stringify(names, null, 2) + "\n");
    } else {
      console.log(names.join(", "));
    }
    return;
  }

  if (args.compact) {
    const compactFields = fields.map(({ fieldname, fieldtype, label, reqd, options }) => ({
      fieldname,
      fieldtype,
      label,
      ...(reqd ? { reqd: 1 as const } : {}),
      // Keep options only for Link/Select/Table types — it names the linked DocType
      ...(LINK_TYPES.has(fieldtype) && options ? { options } : {}),
    }));

    if (fmt === "json") {
      process.stdout.write(
        JSON.stringify({ name: meta.name, module: meta.module, fields: compactFields }, null, 2) + "\n",
      );
      return;
    }
    // Fall through to table/csv with compact fields
    const header = `${"FIELDNAME".padEnd(30)} ${"FIELDTYPE".padEnd(18)} ${"LABEL".padEnd(30)} ${"REQD".padEnd(4)} OPTIONS`;
    console.log(header);
    console.log("-".repeat(header.length));
    for (const f of compactFields) {
      const opts = "options" in f && f.options ? String(f.options) : "";
      console.log(
        `${f.fieldname.padEnd(30)} ${f.fieldtype.padEnd(18)} ${(f.label ?? "").padEnd(30)} ${(f.reqd ? "yes" : "no").padEnd(4)} ${opts}`,
      );
    }
    return;
  }

  if (fmt === "json") {
    process.stdout.write(JSON.stringify({ ...meta, fields }, null, 2) + "\n");
    return;
  }

  if (fmt === "table") {
    const header = `${"FIELDNAME".padEnd(30)} ${"FIELDTYPE".padEnd(18)} ${"LABEL".padEnd(30)} ${"REQD".padEnd(4)} OPTIONS`;
    console.log(header);
    console.log("-".repeat(header.length));
    for (const f of fields) {
      const options = f.options && !f.options.includes("\n") ? f.options : "";
      console.log(
        `${f.fieldname.padEnd(30)} ${f.fieldtype.padEnd(18)} ${(f.label ?? "").padEnd(30)} ${(f.reqd ? "yes" : "no").padEnd(4)} ${options}`,
      );
    }
    return;
  }

  // csv
  console.log("fieldname,fieldtype,label,reqd,options");
  for (const f of fields) {
    const options = (f.options ?? "").replace(/\n/g, "|");
    console.log(`${f.fieldname},${f.fieldtype},${f.label ?? ""},${f.reqd ? "yes" : "no"},${options}`);
  }
}
