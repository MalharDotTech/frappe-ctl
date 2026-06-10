import { FrappeClient } from "../client.ts";

interface DiffArgs {
  doctype: string;
  name: string;
  data: Record<string, unknown>;
}

export async function cmdDiff(client: FrappeClient, args: DiffArgs): Promise<void> {
  const doc = await client.getDoc(args.doctype, args.name);

  const changed: { field: string; current: unknown; proposed: unknown }[] = [];
  for (const [k, proposed] of Object.entries(args.data)) {
    const current = doc[k];
    if (String(current ?? "") !== String(proposed ?? "")) {
      changed.push({ field: k, current, proposed });
    }
  }

  if (!changed.length) {
    console.log("No changes.");
    return;
  }

  const fieldW = Math.max(5, ...changed.map((c) => c.field.length));
  const currentW = Math.max(7, ...changed.map((c) => String(c.current ?? "").length));

  console.log(`${"FIELD".padEnd(fieldW)}  ${"CURRENT".padEnd(currentW)}  PROPOSED`);
  console.log(`${"-".repeat(fieldW)}  ${"-".repeat(currentW)}  ${"-".repeat(20)}`);
  for (const { field, current, proposed } of changed) {
    console.log(`${field.padEnd(fieldW)}  ${String(current ?? "").padEnd(currentW)}  ${String(proposed)}`);
  }
}
