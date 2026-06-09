import { FrappeClient } from "../client.ts";
import { type OutputFormat } from "../output.ts";

interface DescribeArgs {
  doctype: string;
  format?: string;
}

interface FrappeField {
  fieldname: string;
  fieldtype: string;
  label: string;
  reqd: number;
  options?: string | null;
}

export async function cmdDescribe(client: FrappeClient, args: DescribeArgs): Promise<void> {
  const meta = await client.getDocTypeMeta(args.doctype) as {
    name: string;
    module?: string;
    fields?: FrappeField[];
  };

  const fmt: OutputFormat = (args.format === "json" || args.format === "csv" || args.format === "table")
    ? args.format
    : process.stdout.isTTY ? "table" : "json";

  if (fmt === "json") {
    process.stdout.write(JSON.stringify(meta, null, 2) + "\n");
    return;
  }

  const fields = (meta.fields ?? []).filter((f) => f.fieldtype !== "Section Break" && f.fieldtype !== "Column Break");

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
