import { writeFileSync } from "fs";
import { FrappeClient } from "../client.ts";

interface PrintArgs {
  doctype: string;
  name: string;
  printFormat?: string;
  noLetterhead?: boolean;
  outFile?: string;   // save to path; if absent, write binary to stdout
  dryRun?: boolean;
}

export async function cmdPrint(client: FrappeClient, args: PrintArgs): Promise<void> {
  if (args.dryRun) {
    const fmt = args.printFormat ? ` format: ${args.printFormat}` : "";
    console.log(`[DRY RUN] Would download PDF for ${args.doctype} ${args.name}${fmt}`);
    return;
  }

  const pdf = await client.downloadPdf(
    args.doctype,
    args.name,
    args.printFormat,
    args.noLetterhead ? 1 : 0,
  );

  if (args.outFile) {
    writeFileSync(args.outFile, pdf);
    console.error(`Saved: ${args.outFile} (${pdf.byteLength} bytes)`);
  } else {
    // Write binary to stdout — pipe to file with > or pass to another tool
    process.stdout.write(pdf);
  }
}
