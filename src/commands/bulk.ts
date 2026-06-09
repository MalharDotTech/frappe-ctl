import { FrappeClient, type FrappeFilter, FrappeRequestError } from "../client.ts";

type BulkSubVerb = "patch" | "delete";

interface BulkArgs {
  subVerb: BulkSubVerb;
  doctype: string;
  filters: FrappeFilter[];
  data: Record<string, unknown>;
  force: boolean;
  dryRun?: boolean;
}

interface BulkResult {
  total: number;
  success: number;
  failed: number;
  errors: { name: string; error: string }[];
}

export async function cmdBulk(client: FrappeClient, args: BulkArgs): Promise<void> {
  if (!["patch", "delete"].includes(args.subVerb)) {
    throw new Error(`Unknown bulk sub-verb '${args.subVerb}'. Valid: patch, delete`);
  }

  if (!args.filters.length) {
    throw new Error(
      `--filter required for bulk operations — refusing to operate on all docs without a filter.\n` +
      `Example: --filter "status=Draft"`,
    );
  }

  if (args.subVerb === "delete" && !args.force) {
    throw new Error(
      `bulk delete requires --force.\n` +
      `Run: frappe-ctl <app> bulk delete ${args.doctype} [filters] --force`,
    );
  }

  // Fetch all matching doc names (paginated)
  const docs = await client.listAll(args.doctype, args.filters, ["name"]);

  if (!docs.length) {
    console.log(JSON.stringify({ total: 0, success: 0, failed: 0, errors: [] }));
    return;
  }

  if (args.dryRun) {
    console.log(`[DRY RUN] Would ${args.subVerb} ${docs.length} ${args.doctype} doc(s):`);
    for (const d of docs) {
      console.log(`  ${String(d["name"])}`);
    }
    console.log(`Total: ${docs.length}`);
    return;
  }

  const result: BulkResult = { total: docs.length, success: 0, failed: 0, errors: [] };

  for (const d of docs) {
    const name = String(d["name"]);
    try {
      if (args.subVerb === "patch") {
        await client.updateDoc(args.doctype, name, args.data);
      } else {
        await client.deleteDoc(args.doctype, name);
      }
      result.success++;
    } catch (err) {
      result.failed++;
      const msg = err instanceof FrappeRequestError
        ? `HTTP ${err.statusCode}: ${err.serverMessage ?? err.message}`
        : (err as Error).message;
      result.errors.push({ name, error: msg });
    }
  }

  console.log(JSON.stringify(result, null, 2));
}
