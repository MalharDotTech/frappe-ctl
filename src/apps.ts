export interface AppDef {
  name: string;
  alias: string;
  description: string;
  supportedVersions: string[];  // vX format only — breaking changes happen at major boundaries
  currentStable: string;        // latest stable major, e.g. "v16"
  modules: string[];            // Frappe module names — used by `resources` to filter DocTypes
}

// Registered Frappe app aliases — extend as ecosystem grows
export const APPS: Record<string, AppDef> = {
  next: {
    alias: "next",
    name: "ERPNext",
    description: "ERP — Sales, Purchase, Stock, Accounting, Projects",
    supportedVersions: ["v14", "v15", "v16"],
    currentStable: "v16",
    modules: ["Accounts", "Buying", "Selling", "Stock", "Manufacturing", "Projects", "CRM", "Support", "Assets", "Loan Management", "E-commerce"],
  },
  hr: {
    alias: "hr",
    name: "Frappe HRMS",
    description: "HR & Payroll",
    supportedVersions: ["v14", "v15", "v16"],
    currentStable: "v16",
    modules: ["HR", "Payroll"],
  },
  crm: {
    alias: "crm",
    name: "Frappe CRM",
    description: "CRM — Leads, Deals, Contacts",
    supportedVersions: ["v1", "v2"],
    currentStable: "v2",
    modules: ["CRM"],
  },
  hd: {
    alias: "hd",
    name: "Frappe Helpdesk",
    description: "Support tickets & SLA",
    supportedVersions: ["v1", "v2"],
    currentStable: "v2",
    modules: ["Helpdesk"],
  },
  lms: {
    alias: "lms",
    name: "Frappe LMS",
    description: "Learning Management System",
    supportedVersions: ["v1", "v2"],
    currentStable: "v2",
    modules: ["LMS"],
  },
  bi: {
    alias: "bi",
    name: "Frappe Insights",
    description: "Analytics & BI dashboards",
    supportedVersions: ["v2", "v3"],
    currentStable: "v3",
    modules: ["Insights"],
  },
  loan: {
    alias: "loan",
    name: "Frappe Lending",
    description: "Loan management",
    supportedVersions: ["v1", "v2"],
    currentStable: "v2",
    modules: ["Lending"],
  },
  health: {
    alias: "health",
    name: "Frappe Healthcare",
    description: "HMS — Patients, Appointments",
    supportedVersions: ["v15", "v16"],
    currentStable: "v16",
    modules: ["Healthcare"],
  },
  edu: {
    alias: "edu",
    name: "Frappe Education",
    description: "School & university management",
    supportedVersions: ["v15", "v16"],
    currentStable: "v16",
    modules: ["Education"],
  },
  frappe: {
    alias: "frappe",
    name: "Frappe (core)",
    description: "Framework — Users, DocTypes, Reports, Webhooks",
    supportedVersions: ["v14", "v15", "v16"],
    currentStable: "v16",
    modules: ["Core", "Custom", "Desk", "Email", "Integrations", "Printing", "Social", "Workflow", "Website"],
  },
};

export function resolveApp(alias: string): AppDef {
  const app = APPS[alias];
  if (!app) {
    const known = Object.keys(APPS).join(", ");
    throw new Error(`Unknown app '${alias}'. Known apps: ${known}`);
  }
  return app;
}

// Returns true only if version is in vX format AND listed in app's supportedVersions
export function isVersionSupported(appAlias: string, version: string): boolean {
  if (!/^v\d+$/.test(version)) return false;
  const app = APPS[appAlias];
  if (!app) return false;
  return app.supportedVersions.includes(version);
}

// Resolves the effective version for an app from a profile's app_versions map.
// Falls back to currentStable when not declared — safe default.
export function resolveAppVersion(
  appAlias: string,
  appVersions: Record<string, string> | undefined,
): string {
  return appVersions?.[appAlias] ?? APPS[appAlias]?.currentStable ?? "v16";
}
