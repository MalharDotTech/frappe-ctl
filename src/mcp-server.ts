import { FrappeClient } from "./client.ts";

const MCP_VERSION = "2024-11-05";
const SERVER_VERSION = "0.1.0";

// JSON-RPC types
interface McpRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// Frappe field types to strip from describe output
const SECTION_TYPES = new Set(["Section Break", "Column Break", "Tab Break"]);

const READ_ONLY_TOOLS: McpTool[] = [
  {
    name: "frappe_get",
    description: "Fetch a single Frappe document by DocType and name, or list documents with optional filters. Supports --sparse to strip null/empty fields (~55% token reduction).",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string", description: "DocType name (e.g. 'Sales Order')" },
        name: { type: "string", description: "Document name. Omit to list docs." },
        filters: {
          type: "array",
          description: "Filter array: [[field, operator, value], ...]. Omit for no filter.",
          items: { type: "array" },
        },
        limit: { type: "number", description: "Max docs to return (default 20)" },
        sparse: { type: "boolean", description: "Strip null/empty/zero fields" },
      },
      required: ["doctype"],
    },
  },
  {
    name: "frappe_count",
    description: "Count documents matching a filter. Returns a plain integer. Always use this instead of listing docs when you only need cardinality.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string" },
        filters: { type: "array", items: { type: "array" } },
      },
      required: ["doctype"],
    },
  },
  {
    name: "frappe_search",
    description: "Text search within a DocType by title field. Makes 2 API calls when field not specified (meta + list). Use field parameter to reduce to 1 call.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string" },
        query: { type: "string", description: "Search string" },
        field: { type: "string", description: "Field to search. Auto-detected from title_field if omitted." },
        limit: { type: "number", description: "Max results (default 20)" },
        sparse: { type: "boolean" },
      },
      required: ["doctype", "query"],
    },
  },
  {
    name: "frappe_describe",
    description: "Get DocType schema. Use required=true to get only required fields (8 fields vs 170). Use relationships=true for Link/Table fields only.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string" },
        required: { type: "boolean", description: "Return only required fields" },
        relationships: { type: "boolean", description: "Return only Link and Table fields" },
      },
      required: ["doctype"],
    },
  },
  {
    name: "frappe_validate",
    description: "Pre-flight check: verify payload has all required fields before create/patch. Returns {valid, required, missing, unknown}. Always call before create when payload is dynamic.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string" },
        data: { type: "object", description: "Payload to validate" },
      },
      required: ["doctype", "data"],
    },
  },
];

const MUTATION_TOOLS: McpTool[] = [
  {
    name: "frappe_create",
    description: "Create a new document. Always call frappe_validate first when payload is dynamic.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string" },
        data: { type: "object", description: "Document fields" },
        sparse: { type: "boolean" },
      },
      required: ["doctype", "data"],
    },
  },
  {
    name: "frappe_patch",
    description: "Update fields on an existing document. Only sends the fields you specify.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string" },
        name: { type: "string" },
        data: { type: "object", description: "Fields to update" },
      },
      required: ["doctype", "name", "data"],
    },
  },
  {
    name: "frappe_delete",
    description: "Delete a document. Requires force=true as a safety gate.",
    inputSchema: {
      type: "object",
      properties: {
        doctype: { type: "string" },
        name: { type: "string" },
        force: { type: "boolean", description: "Must be true to confirm deletion" },
      },
      required: ["doctype", "name", "force"],
    },
  },
];

export function getMcpTools(allowMutations: boolean): McpTool[] {
  return allowMutations ? [...READ_ONLY_TOOLS, ...MUTATION_TOOLS] : [...READ_ONLY_TOOLS];
}

function text(t: string): McpToolResult {
  return { content: [{ type: "text", text: t }] };
}

function errorResult(msg: string): McpToolResult {
  return { content: [{ type: "text", text: msg }], isError: true };
}

function sparseObj(doc: Record<string, unknown>, sparse?: boolean): Record<string, unknown> {
  if (!sparse) return doc;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v !== null && v !== undefined && v !== "" && v !== 0) out[k] = v;
  }
  return out;
}

export async function callMcpTool(
  client: FrappeClient,
  toolName: string,
  input: Record<string, unknown>,
  allowMutations: boolean,
): Promise<McpToolResult> {
  const mutationTools = new Set(["frappe_create", "frappe_patch", "frappe_delete"]);

  if (mutationTools.has(toolName) && !allowMutations) {
    return errorResult(`Tool '${toolName}' is a mutation. Start frappe-ctl mcp with --allow-mutations to enable write tools.`);
  }

  try {
    switch (toolName) {
      case "frappe_get": {
        const doctype = String(input["doctype"]);
        const name = input["name"] ? String(input["name"]) : undefined;
        const sparse = input["sparse"] === true;
        const limit = typeof input["limit"] === "number" ? input["limit"] : 20;
        const filters = Array.isArray(input["filters"]) ? input["filters"] as [string, string, string][] : undefined;

        if (name) {
          const doc = await client.getDoc(doctype, name) as Record<string, unknown>;
          return text(JSON.stringify(sparseObj(doc, sparse), null, 2));
        } else {
          const docs = await client.listDocs(doctype, { filters, limit }) as Record<string, unknown>[];
          const result = sparse ? docs.map((d) => sparseObj(d, true)) : docs;
          return text(JSON.stringify(result, null, 2));
        }
      }

      case "frappe_count": {
        const doctype = String(input["doctype"]);
        const filters = Array.isArray(input["filters"]) ? input["filters"] as [string, string, string][] : undefined;
        const count = await client.countDocs(doctype, filters);
        return text(String(count));
      }

      case "frappe_search": {
        const doctype = String(input["doctype"]);
        const query = String(input["query"]);
        const sparse = input["sparse"] === true;
        const limit = typeof input["limit"] === "number" ? input["limit"] : 20;

        let searchField = input["field"] ? String(input["field"]) : undefined;
        if (!searchField) {
          const meta = await client.getDocTypeMeta(doctype) as { title_field?: string };
          searchField = meta.title_field ?? "name";
        }

        const docs = await client.searchDocs(doctype, query, searchField, { limit }) as Record<string, unknown>[];
        const result = sparse ? docs.map((d) => sparseObj(d, true)) : docs;
        return text(JSON.stringify(result, null, 2));
      }

      case "frappe_describe": {
        const doctype = String(input["doctype"]);
        const meta = await client.getDocTypeMeta(doctype) as {
          name: string; module?: string; is_submittable?: number;
          fields?: Array<{ fieldname: string; fieldtype: string; label: string; reqd?: number; options?: string | null }>;
        };

        let fields = (meta.fields ?? []).filter((f) => !SECTION_TYPES.has(f.fieldtype));

        if (input["required"] === true) {
          fields = fields.filter((f) => f.reqd === 1);
        }
        if (input["relationships"] === true) {
          fields = fields.filter((f) => f.fieldtype === "Link" || f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect");
        }

        const LINK_TYPES = new Set(["Link", "Select", "Table", "Table MultiSelect"]);
        const slim = fields.map(({ fieldname, fieldtype, label, reqd, options }) => ({
          fieldname,
          fieldtype,
          label,
          ...(reqd ? { reqd: 1 as const } : {}),
          ...(LINK_TYPES.has(fieldtype) && options ? { options } : {}),
        }));
        return text(JSON.stringify({ name: meta.name, module: meta.module, is_submittable: meta.is_submittable ?? 0, fields: slim }, null, 2));
      }

      case "frappe_validate": {
        const doctype = String(input["doctype"]);
        const data = (input["data"] ?? {}) as Record<string, unknown>;
        const meta = await client.getDocTypeMeta(doctype) as {
          fields?: Array<{ fieldname: string; fieldtype: string; reqd?: number }>;
        };

        const fields = (meta.fields ?? []).filter((f) => !SECTION_TYPES.has(f.fieldtype));
        const required = fields.filter((f) => f.reqd === 1).map((f) => f.fieldname);
        const allNames = new Set(fields.map((f) => f.fieldname));
        const dataKeys = Object.keys(data);

        const missing = required.filter((f) => !(f in data) || data[f] === null || data[f] === undefined || data[f] === "");
        const unknown = dataKeys.filter((k) => !allNames.has(k));

        return text(JSON.stringify({ valid: missing.length === 0 && unknown.length === 0, required, missing, unknown }, null, 2));
      }

      case "frappe_create": {
        const doctype = String(input["doctype"]);
        const data = input["data"] as Record<string, unknown>;
        const sparse = input["sparse"] === true;
        const doc = await client.createDoc(doctype, data) as Record<string, unknown>;
        return text(JSON.stringify(sparseObj(doc, sparse), null, 2));
      }

      case "frappe_patch": {
        const doctype = String(input["doctype"]);
        const name = String(input["name"]);
        const data = input["data"] as Record<string, unknown>;
        const doc = await client.updateDoc(doctype, name, data) as Record<string, unknown>;
        return text(JSON.stringify(doc, null, 2));
      }

      case "frappe_delete": {
        if (input["force"] !== true) {
          return errorResult("frappe_delete requires force=true. Set force=true to confirm deletion.");
        }
        const doctype = String(input["doctype"]);
        const name = String(input["name"]);
        await client.deleteDoc(doctype, name);
        return text(JSON.stringify({ deleted: true, doctype, name }));
      }

      default:
        return errorResult(`Unknown tool '${toolName}'. Call tools/list to see available tools.`);
    }
  } catch (err) {
    return errorResult((err as Error).message ?? String(err));
  }
}

export async function handleMcpRequest(
  client: FrappeClient,
  msg: McpRequest,
  allowMutations: boolean,
): Promise<McpResponse | null> {
  // Notifications have no id — no response expected
  if (msg.id === undefined && msg.method.startsWith("notifications/")) return null;

  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize":
      return {
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: MCP_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "frappe-ctl", version: SERVER_VERSION },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0", id,
        result: { tools: getMcpTools(allowMutations) },
      };

    case "tools/call": {
      const params = msg.params ?? {};
      const name = String(params["name"] ?? "");
      const args = (params["arguments"] ?? {}) as Record<string, unknown>;
      const toolResult = await callMcpTool(client, name, args, allowMutations);
      return { jsonrpc: "2.0", id, result: toolResult };
    }

    default:
      return {
        jsonrpc: "2.0", id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      };
  }
}

export async function runMcpServer(
  client: FrappeClient,
  opts: { allowMutations?: boolean } = {},
): Promise<void> {
  const allowMutations = opts.allowMutations ?? false;

  process.stderr.write(`frappe-ctl MCP server ready (mutations: ${allowMutations ? "enabled" : "disabled"})\n`);

  const decoder = new TextDecoder();
  let buf = "";

  for await (const chunk of process.stdin as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as McpRequest;
        const response = await handleMcpRequest(client, msg, allowMutations);
        if (response !== null) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch {
        const errResponse: McpResponse = {
          jsonrpc: "2.0", id: null,
          error: { code: -32700, message: "Parse error" },
        };
        process.stdout.write(JSON.stringify(errResponse) + "\n");
      }
    }
  }
}
