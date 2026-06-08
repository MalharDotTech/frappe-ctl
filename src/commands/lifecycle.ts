import { FrappeClient } from "../client.ts";

interface LifecycleArgs {
  doctype: string;
  name: string;
  dryRun?: boolean;
}

export async function cmdSubmit(client: FrappeClient, args: LifecycleArgs): Promise<void> {
  if (args.dryRun) {
    console.log(`[DRY RUN] Would submit ${args.doctype} ${args.name} (docstatus: 0 → 1)`);
    return;
  }
  const result = await client.submitDoc(args.doctype, args.name) as Record<string, unknown>;
  const docstatus = result["docstatus"] ?? 1;
  console.log(`Submitted: ${args.doctype} ${args.name} (docstatus: ${docstatus})`);
}

export async function cmdCancel(client: FrappeClient, args: LifecycleArgs): Promise<void> {
  if (args.dryRun) {
    console.log(`[DRY RUN] Would cancel ${args.doctype} ${args.name} (docstatus: 1 → 2)`);
    return;
  }
  const result = await client.cancelDoc(args.doctype, args.name) as Record<string, unknown>;
  const docstatus = result["docstatus"] ?? 2;
  console.log(`Cancelled: ${args.doctype} ${args.name} (docstatus: ${docstatus})`);
}
