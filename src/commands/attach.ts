import { readFileSync, existsSync } from "fs";
import { basename } from "path";
import { FrappeClient } from "../client.ts";

interface AttachArgs {
  doctype: string;
  name: string;
  file: string;
  isPrivate?: boolean;
  dryRun?: boolean;
}

export async function cmdAttach(client: FrappeClient, args: AttachArgs): Promise<void> {
  if (!existsSync(args.file)) {
    throw new Error(`File not found: ${args.file}`);
  }

  const filename = basename(args.file);

  if (args.dryRun) {
    console.log(`[DRY RUN] Would attach '${filename}' to ${args.doctype} ${args.name}`);
    return;
  }

  const fileBuffer = readFileSync(args.file) as unknown as Buffer;
  const result = await client.uploadFile(
    args.doctype,
    args.name,
    filename,
    fileBuffer,
    args.isPrivate ? 1 : 0,
  );

  const fileUrl = result["file_url"] ?? result["name"];
  console.log(`Attached: ${filename} → ${fileUrl}`);
  console.log(JSON.stringify(result, null, 2));
}
