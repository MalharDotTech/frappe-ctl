import { FrappeClient } from "../client.ts";

interface WorkflowArgs {
  doctype: string;
  name: string;
  action: string;
  dryRun?: boolean;
}

export async function cmdWorkflow(client: FrappeClient, args: WorkflowArgs): Promise<void> {
  if (args.dryRun) {
    console.log(`[DRY RUN] Would apply workflow action '${args.action}' to ${args.doctype} ${args.name}`);
    return;
  }

  const result = await client.callMethod<Record<string, unknown>>(
    "frappe.model.workflow.apply_workflow",
    { doc: { doctype: args.doctype, name: args.name }, action: args.action },
  );

  const state = result?.["workflow_state"] ?? "unknown";
  console.log(`Workflow: ${args.doctype} ${args.name} → ${state} (action: ${args.action})`);
}
