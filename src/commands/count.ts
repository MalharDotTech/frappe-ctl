import { FrappeClient, type FrappeFilter } from "../client.ts";

interface CountArgs {
  doctype: string;
  filters?: FrappeFilter[];
}

export async function cmdCount(client: FrappeClient, args: CountArgs): Promise<void> {
  const count = await client.countDocs(args.doctype, args.filters);
  process.stdout.write(String(count) + "\n");
}
