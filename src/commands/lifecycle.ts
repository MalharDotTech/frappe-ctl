import { FrappeClient } from "../client.ts";

interface LifecycleArgs {
  doctype: string;
  name: string;
}

export async function cmdSubmit(client: FrappeClient, args: LifecycleArgs): Promise<void> {
  const result = await client.submitDoc(args.doctype, args.name) as Record<string, unknown>;
  const docstatus = result["docstatus"] ?? 1;
  console.log(`Submitted: ${args.doctype} ${args.name} (docstatus: ${docstatus})`);
}

export async function cmdCancel(client: FrappeClient, args: LifecycleArgs): Promise<void> {
  const result = await client.cancelDoc(args.doctype, args.name) as Record<string, unknown>;
  const docstatus = result["docstatus"] ?? 2;
  console.log(`Cancelled: ${args.doctype} ${args.name} (docstatus: ${docstatus})`);
}
