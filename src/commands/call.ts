import { FrappeClient } from "../client.ts";

interface CallArgs {
  method: string;
  data?: Record<string, unknown>;
  format?: string;
  wait?: boolean;
}

export async function cmdCall(client: FrappeClient, args: CallArgs): Promise<void> {
  const result = await client.callMethod<unknown>(args.method, args.data);

  if (args.wait && result && typeof result === "object" && !Array.isArray(result)) {
    const jobName = (result as Record<string, unknown>)["job_name"];
    if (typeof jobName === "string") {
      console.error(`Waiting for job ${jobName}...`);
      const info = await client.waitForJob(jobName);
      if (info.status === "failed") {
        throw new Error(`Job failed: ${info.exc_info ?? "unknown error"}`);
      }
      process.stdout.write(JSON.stringify(info.result ?? null, null, 2) + "\n");
      return;
    }
  }

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
