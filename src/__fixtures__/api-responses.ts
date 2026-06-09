// Canonical shapes from Frappe REST API — used across all tests.
// Update these when adding new DocTypes or API surface changes.

export const userListResponse = {
  data: [
    {
      name: "Administrator",
      email: "admin@example.com",
      enabled: 1,
      user_type: "System User",
      full_name: "Administrator",
    },
    {
      name: "Guest",
      email: "guest@example.com",
      enabled: 1,
      user_type: "Website User",
      full_name: "Guest",
    },
  ],
};

export const userGetResponse = {
  data: {
    name: "Administrator",
    email: "admin@example.com",
    enabled: 1,
    user_type: "System User",
    full_name: "Administrator",
    doctype: "User",
  },
};

export const salesOrderListResponse = {
  data: [
    {
      name: "SO-2024-00001",
      customer: "Magic Peacock Studio",
      status: "Draft",
      transaction_date: "2024-06-01",
      grand_total: 14000,
    },
  ],
};

export const emptyListResponse = { data: [] };

export const countResponse = { message: 42 };

export const doctypeMetaResponse = {
  name: "Sales Order",
  module: "Selling",
  fields: [
    { fieldname: "customer", fieldtype: "Link", label: "Customer", reqd: 1, options: "Customer" },
    { fieldname: "transaction_date", fieldtype: "Date", label: "Date", reqd: 1, options: null },
    { fieldname: "delivery_date", fieldtype: "Date", label: "Delivery Date", reqd: 0, options: null },
    { fieldname: "status", fieldtype: "Select", label: "Status", reqd: 0, options: "Draft\nOn Hold\nCancelled" },
    { fieldname: "grand_total", fieldtype: "Currency", label: "Grand Total", reqd: 0, options: null },
  ],
};

export const createResponse = {
  data: {
    name: "SO-2024-00001",
    doctype: "Sales Order",
    customer: "Magic Peacock Studio",
    status: "Draft",
    grand_total: 14000,
  },
};

export const updateResponse = {
  data: {
    name: "SO-2024-00001",
    doctype: "Sales Order",
    customer: "Magic Peacock Studio",
    status: "On Hold",
    grand_total: 14000,
  },
};

// Full doc returned by getDoc before submit/cancel — Frappe requires the whole doc
export const salesOrderDocResponse = {
  data: {
    name: "SO-2024-00001",
    doctype: "Sales Order",
    docstatus: 0,
    status: "Draft",
    customer: "Magic Peacock Studio",
    grand_total: 14000,
  },
};

export const submitResponse = {
  message: {
    name: "SO-2024-00001",
    docstatus: 1,
    status: "To Deliver and Bill",
  },
};

export const cancelResponse = {
  message: {
    name: "SO-2024-00001",
    docstatus: 2,
    status: "Cancelled",
  },
};

export const reportResponse = {
  message: {
    columns: [
      { label: "Project", fieldname: "project", fieldtype: "Link" },
      { label: "Customer", fieldname: "customer", fieldtype: "Link" },
      { label: "Billed Amount", fieldname: "billed_amount", fieldtype: "Currency" },
    ],
    result: [
      ["Promotional Shoot V Builders", "Magic Peacock Studio", 14000],
      ["Corporate Film Infosys", "Infosys", 50000],
    ],
  },
};

export const callMethodResponse = {
  message: [
    { name: "SO-2024-00001", customer: "Magic Peacock Studio", status: "Draft" },
  ],
};

export const resourcesResponse = {
  message: [
    { name: "Sales Order", module: "Selling", is_submittable: 1 },
    { name: "Sales Invoice", module: "Accounts", is_submittable: 1 },
    { name: "Customer", module: "Selling", is_submittable: 0 },
    { name: "Selling Settings", module: "Selling", is_submittable: 0 },
  ],
};

// Error shapes from Frappe
export const authErrorResponse = {
  status: 403,
  exc_type: "PermissionError",
  exception: "frappe.exceptions.PermissionError: Not permitted",
};

export const notFoundResponse = {
  status: 404,
  exc_type: "DoesNotExistError",
  exception: "frappe.exceptions.DoesNotExistError",
};
