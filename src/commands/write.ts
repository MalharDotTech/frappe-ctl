import { FrappeClient } from "../client.ts";
import { detectFormat, printDoc } from "../output.ts";

interface CreateArgs {
  doctype: string;
  data: Record<string, unknown>;
  format?: string;
  dryRun?: boolean;
}

interface PatchArgs {
  doctype: string;
  name: string;
  data: Record<string, unknown>;
  format?: string;
  dryRun?: boolean;
}

interface DeleteArgs {
  doctype: string;
  name: string;
  force: boolean;
  dryRun?: boolean;
}

export async function cmdCreate(client: FrappeClient, args: CreateArgs): Promise<void> {
  if (args.dryRun) {
    console.log(`[DRY RUN] Would create ${args.doctype}:`);
    console.log(JSON.stringify(args.data, null, 2));
    return;
  }
  const doc = await client.createDoc(args.doctype, args.data);
  printDoc(doc, detectFormat(args.format));
}

export async function cmdPatch(client: FrappeClient, args: PatchArgs): Promise<void> {
  if (args.dryRun) {
    console.log(`[DRY RUN] Would patch ${args.doctype} ${args.name}:`);
    console.log(JSON.stringify(args.data, null, 2));
    return;
  }
  const doc = await client.updateDoc(args.doctype, args.name, args.data);
  printDoc(doc, detectFormat(args.format));
}

export async function cmdDelete(client: FrappeClient, args: DeleteArgs): Promise<void> {
  if (args.dryRun) {
    console.log(`[DRY RUN] Would delete ${args.doctype} ${args.name}`);
    return;
  }
  if (!args.force) {
    throw new Error(
      `Destructive operation requires --force flag.\n` +
      `Run: frappe-ctl <app> delete ${args.doctype} ${args.name} --force`,
    );
  }
  await client.deleteDoc(args.doctype, args.name);
  console.log(`Deleted: ${args.doctype} ${args.name}`);
}
