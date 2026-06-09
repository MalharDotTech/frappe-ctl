import { FrappeClient } from "../client.ts";

interface CallArgs {
  method: string;
  data?: Record<string, unknown>;
  format?: string;
}

export async function cmdCall(client: FrappeClient, args: CallArgs): Promise<void> {
  const result = await client.callMethod<unknown>(args.method, args.data);

  const fmt = args.format ?? (process.stdout.isTTY ? "table" : "json");

  // Raw method output — always JSON (no table interpretation, shape is unknown)
  if (fmt === "table" && result && typeof result === "object" && !Array.isArray(result)) {
    for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      console.log(`${k.padEnd(30)} ${val}`);
    }
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
}
