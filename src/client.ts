export type FrappeFilter = [string, string, string] | [string, string, string, string];

export interface ListOptions {
  filters?: FrappeFilter[];
  fields?: string[];
  limit?: number;
  limitStart?: number;
  orderBy?: string;
}

export interface FrappeError {
  statusCode: number;
  message: string;
  serverMessage?: string;
}

export class FrappeRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly serverMessage?: string,
  ) {
    super(message);
    this.name = "FrappeRequestError";
  }
}

export interface FrappeClientConfig {
  url: string;
  // Self-hosted: API key auth (ADR-001 — NOT Bearer, NOT Basic)
  apiKey?: string;
  apiSecret?: string;
  // Frappe Cloud OAuth: Bearer token path (ADR-009 — distinct from api_key path)
  bearerToken?: string;
}

export class FrappeClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: FrappeClientConfig) {
    // Strip trailing slash — every endpoint we build starts with /
    this.baseUrl = config.url.replace(/\/$/, "");
    if (config.bearerToken) {
      // OAuth path — Authorization: Bearer <access_token>
      this.authHeader = `Bearer ${config.bearerToken}`;
    } else {
      // API key path — Authorization: token key:secret (Frappe-specific, NOT standard Bearer)
      this.authHeader = `token ${config.apiKey ?? ""}:${config.apiSecret ?? ""}`;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
    };

    let fetchBody: string | undefined;
    if (body) {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: fetchBody });
    } catch (err) {
      throw new FrappeRequestError(0, `Network error: ${(err as Error).message}`);
    }

    // Bun 1.3.x res.text() truncates at 64KB — arrayBuffer() accumulates all chunks
    const text = new TextDecoder().decode(await res.arrayBuffer());

    if (!res.ok) {
      let serverMessage: string | undefined;
      try {
        const parsed = JSON.parse(text) as { exc_type?: string; _server_messages?: string; exception?: string };
        if (parsed._server_messages) {
          // Frappe double-encodes: outer JSON array of inner JSON-encoded {message,title} strings
          try {
            const inner = (JSON.parse(parsed._server_messages) as string[])[0] ?? "{}";
            serverMessage = (JSON.parse(inner) as { message?: string }).message ?? inner;
          } catch {
            serverMessage = parsed._server_messages;
          }
        }
        serverMessage ??= parsed.exception ?? parsed.exc_type;
      } catch {
        serverMessage = text.slice(0, 300);
      }
      throw new FrappeRequestError(res.status, `HTTP ${res.status} ${res.statusText}`, serverMessage);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new FrappeRequestError(res.status, `Invalid JSON response from server`);
    }
  }

  // ── Resource API ────────────────────────────────────────────────────────────

  async getDoc(doctype: string, name: string): Promise<Record<string, unknown>> {
    const res = await this.request<{ data: Record<string, unknown> }>(
      "GET",
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    );
    return res.data;
  }

  async listDocs(doctype: string, opts: ListOptions = {}): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams();

    if (opts.filters?.length) {
      params.set("filters", JSON.stringify(opts.filters));
    }
    // Default to all fields — "name only" default is useless for a CLI
    params.set("fields", JSON.stringify(opts.fields ?? ["*"]));
    params.set("limit_page_length", String(opts.limit ?? 20));
    if (opts.limitStart) params.set("limit_start", String(opts.limitStart));
    if (opts.orderBy) params.set("order_by", opts.orderBy);

    const res = await this.request<{ data: Record<string, unknown>[] }>(
      "GET",
      `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`,
    );
    return res.data;
  }

  async countDocs(doctype: string, filters?: FrappeFilter[]): Promise<number> {
    const body: Record<string, unknown> = { doctype };
    if (filters?.length) body.filters = filters;
    const res = await this.request<{ message: number }>(
      "POST",
      `/api/method/frappe.client.get_count`,
      body,
    );
    return res.message;
  }

  async createDoc(
    doctype: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await this.request<{ data: Record<string, unknown> }>(
      "POST",
      `/api/resource/${encodeURIComponent(doctype)}`,
      { doctype, ...data },
    );
    return res.data;
  }

  async updateDoc(
    doctype: string,
    name: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res = await this.request<{ data: Record<string, unknown> }>(
      "PUT",
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      data,
    );
    return res.data;
  }

  async deleteDoc(doctype: string, name: string): Promise<void> {
    await this.request<unknown>(
      "DELETE",
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    );
  }

  // ── Method API ───────────────────────────────────────────────────────────────

  async callMethod<T = unknown>(
    method: string,
    data?: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.request<{ message: T }>(
      "POST",
      `/api/method/${method}`,
      data,
    );
    return res.message;
  }

  async submitDoc(doctype: string, name: string): Promise<Record<string, unknown>> {
    // frappe.client.submit requires the full document object — {doctype,name} alone returns 417
    const doc = await this.getDoc(doctype, name);
    return this.callMethod<Record<string, unknown>>("frappe.client.submit", { doc });
  }

  async cancelDoc(doctype: string, name: string): Promise<Record<string, unknown>> {
    // frappe.client.cancel same requirement as submit — needs full doc
    const doc = await this.getDoc(doctype, name);
    return this.callMethod<Record<string, unknown>>("frappe.client.cancel", { doc });
  }

  async getDocTypeMeta(doctype: string): Promise<Record<string, unknown>> {
    return this.callMethod<Record<string, unknown>>("frappe.client.get", {
      doctype: "DocType",
      name: doctype,
    });
  }

  async runReport(
    reportName: string,
    filters?: Record<string, unknown>,
  ): Promise<ReportResult> {
    return this.callMethod<ReportResult>("frappe.desk.query_report.run", {
      report_name: reportName,
      filters: filters ?? {},
      ignore_prepared_report: 1,
    });
  }

  // Paginate listDocs until exhausted — returns ALL matching docs (names only by default)
  async listAll(doctype: string, filters: FrappeFilter[] = [], fields = ["name"]): Promise<Record<string, unknown>[]> {
    const PAGE = 100;
    const all: Record<string, unknown>[] = [];
    let start = 0;
    while (true) {
      const page = await this.listDocs(doctype, { filters, fields, limit: PAGE, limitStart: start });
      all.push(...page);
      if (page.length < PAGE) break;
      start += PAGE;
    }
    return all;
  }

  async uploadFile(
    doctype: string,
    docname: string,
    filename: string,
    fileBuffer: Buffer,
    isPrivate = 0,
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/api/method/upload_file`;
    const form = new FormData();
    form.append("doctype", doctype);
    form.append("docname", docname);
    form.append("is_private", String(isPrivate));
    form.append("file", new Blob([fileBuffer]), filename);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: form,
      });
    } catch (err) {
      throw new FrappeRequestError(0, `Network error: ${(err as Error).message}`);
    }

    // Bun 1.3.x res.text() truncates at 64KB — arrayBuffer() accumulates all chunks
    const text = new TextDecoder().decode(await res.arrayBuffer());
    if (!res.ok) {
      throw new FrappeRequestError(res.status, `HTTP ${res.status} ${res.statusText}`, text.slice(0, 200));
    }
    const parsed = JSON.parse(text) as { message: Record<string, unknown> };
    return parsed.message;
  }

  async downloadPdf(
    doctype: string,
    name: string,
    printFormat?: string,
    noLetterhead = 0,
  ): Promise<Uint8Array> {
    const params = new URLSearchParams({
      doctype,
      name,
      no_letterhead: String(noLetterhead),
    });
    if (printFormat) params.set("format", printFormat);

    const url = `${this.baseUrl}/api/method/frappe.utils.print_format.download_pdf?${params.toString()}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: this.authHeader } });
    } catch (err) {
      throw new FrappeRequestError(0, `Network error: ${(err as Error).message}`);
    }
    if (!res.ok) {
      // Bun 1.3.x res.text() truncates at 64KB — arrayBuffer() accumulates all chunks
    const text = new TextDecoder().decode(await res.arrayBuffer());
      throw new FrappeRequestError(res.status, `HTTP ${res.status} ${res.statusText}`, text.slice(0, 200));
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async searchDocs(
    doctype: string,
    query: string,
    searchField: string,
    opts: ListOptions = {},
  ): Promise<Record<string, unknown>[]> {
    return this.listDocs(doctype, {
      ...opts,
      filters: [[searchField, "like", `%${query}%`], ...(opts.filters ?? [])],
    });
  }

  async listDocTypes(modules?: string[]): Promise<Record<string, unknown>[]> {
    // Use POST method (frappe.client.get_list) instead of GET /api/resource
    // to avoid URL length limits when filtering by many modules
    const body: Record<string, unknown> = {
      doctype: "DocType",
      fields: ["name", "module", "is_submittable", "description"],
      limit_page_length: 500,
      order_by: "module asc, name asc",
    };
    if (modules?.length) {
      // Frappe "in" filter expects comma-separated string, not an array
      body.filters = [["module", "in", modules.join(",")]];
    }
    const result = await this.callMethod<Record<string, unknown>[]>(
      "frappe.client.get_list",
      body,
    );
    return result ?? [];
  }
}

export interface ReportColumn {
  label: string;
  fieldname: string;
  fieldtype: string;
}

export interface ReportResult {
  columns: ReportColumn[];
  result: unknown[][];
  message?: string;
}
