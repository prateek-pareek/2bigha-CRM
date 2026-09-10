import api from "./api";

export type FormFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox";

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Single line text",
  textarea: "Multi-line text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  multiselect: "Multi-select",
  radio: "Radio buttons",
  checkbox: "Checkbox",
};

/** Field types that need an `options` list. */
export const FORM_FIELD_OPTION_TYPES: FormFieldType[] = ["select", "multiselect", "radio"];

export type FormFieldLeadTarget =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "organization"
  | "jobTitle"
  | "notes";

export const FORM_FIELD_LEAD_TARGET_LABELS: Record<FormFieldLeadTarget, string> = {
  fullName: "Full name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  organization: "Company / organization",
  jobTitle: "Job title",
  notes: "Notes",
};

export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  mapsTo?: FormFieldLeadTarget;
  order: number;
};

export type FormLeadDefaults = {
  pipeline?: string;
  leadCategory?: string;
  group?: string;
};

export type FormDefinition = {
  _id: string;
  name: string;
  description?: string;
  module: "2Bigha" | "PROPERTY_MGMT" | "LEGAL";
  fields: FormField[];
  isActive: boolean;
  submitButtonLabel: string;
  successMessage: string;
  redirectUrl?: string;
  accentColor?: string;
  leadDefaults?: FormLeadDefaults;
  submissionCount: number;
  lastSubmissionAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type FormSubmissionStatus = "created_lead" | "merged_into_existing" | "failed";

export const FORM_SUBMISSION_STATUS_LABELS: Record<FormSubmissionStatus, string> = {
  created_lead: "New lead",
  merged_into_existing: "Merged",
  failed: "Failed",
};

export type FormSubmission = {
  _id: string;
  formId: string;
  formName?: string;
  answers: Record<string, unknown>;
  leadId?: string;
  status: FormSubmissionStatus;
  error?: string;
  referrer?: string;
  utm?: Record<string, string>;
  createdAt: string;
};

export type PublicForm = {
  _id: string;
  name: string;
  description?: string;
  fields: Array<
    Pick<FormField, "key" | "label" | "type" | "required" | "placeholder" | "helpText" | "options">
  >;
  submitButtonLabel: string;
  accentColor?: string;
};

export type FormSubmissionsQuery = {
  page?: number;
  limit?: number;
  status?: FormSubmissionStatus | "";
  q?: string;
  from?: string;
  to?: string;
  utmSource?: string;
};

export type FormSubmissionsResult = {
  items: FormSubmission[];
  total: number;
  page: number;
  limit: number;
};

export function leadPipelineId(pipeline?: unknown): string {
  if (!pipeline) return "";
  if (typeof pipeline === "string") return pipeline;
  if (typeof pipeline === "object" && pipeline !== null) {
    if ("_id" in pipeline) return String((pipeline as { _id: unknown })._id);
    if ("$oid" in pipeline) return String((pipeline as { $oid: unknown }).$oid);
  }
  const asString = String(pipeline);
  return asString === "[object Object]" ? "" : asString;
}

export function normalizeLeadDefaults(defaults?: FormLeadDefaults | null): FormLeadDefaults {
  return {
    pipeline: leadPipelineId(defaults?.pipeline) || undefined,
    leadCategory: defaults?.leadCategory || undefined,
    group: defaults?.group || undefined,
  };
}

export const FORM_STARTER_FIELDS: Array<Omit<FormField, "key" | "order">> = [
  {
    label: "Full name",
    type: "text",
    required: true,
    placeholder: "Your full name",
    mapsTo: "fullName",
  },
  {
    label: "Email",
    type: "email",
    required: true,
    placeholder: "you@example.com",
    mapsTo: "email",
  },
  {
    label: "Phone",
    type: "phone",
    required: true,
    placeholder: "+91 …",
    mapsTo: "phone",
  },
];

export async function listForms(): Promise<FormDefinition[]> {
  const res = await api.get("/crm/forms");
  return res.data;
}

export async function getForm(id: string): Promise<FormDefinition> {
  const res = await api.get(`/crm/forms/${id}`);
  return res.data;
}

export async function createForm(payload: Partial<FormDefinition>): Promise<FormDefinition> {
  const res = await api.post("/crm/forms", payload);
  return res.data;
}

export async function updateForm(id: string, payload: Partial<FormDefinition>): Promise<FormDefinition> {
  const res = await api.patch(`/crm/forms/${id}`, payload);
  return res.data;
}

export async function deleteForm(id: string): Promise<void> {
  await api.delete(`/crm/forms/${id}`);
}

export async function listSubmissions(
  id: string,
  query: FormSubmissionsQuery = {},
): Promise<FormSubmissionsResult> {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    limit: query.limit ?? 25,
  };
  if (query.status) params.status = query.status;
  if (query.q?.trim()) params.q = query.q.trim();
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.utmSource?.trim()) params.utmSource = query.utmSource.trim();
  const res = await api.get(`/crm/forms/${id}/submissions`, { params });
  return {
    items: res.data?.items || [],
    total: res.data?.total ?? 0,
    page: res.data?.page ?? params.page,
    limit: res.data?.limit ?? params.limit,
  };
}

// --- Public (unauthenticated) endpoints — used by the hosted /forms/[id] page ---

export async function getPublicForm(id: string): Promise<PublicForm> {
  const res = await api.get(`/forms/public/${id}`);
  return res.data;
}

export async function submitPublicForm(
  id: string,
  answers: Record<string, unknown>,
  utm?: Record<string, string>,
  honeypot?: string,
): Promise<{ success: true; successMessage: string; redirectUrl?: string }> {
  const res = await api.post(`/forms/public/${id}/submit`, { answers, utm, _hp: honeypot || undefined });
  return res.data;
}

/** Slugifies a field label into a stable `key` (letters/numbers/underscore, starts with a letter). */
export function slugifyFieldKey(label: string, existingKeys: string[] = []): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[0-9]/, "f_$&") || "field";
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${i++}`;
  }
  return key;
}

export function formatAnswerValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean).join(", ") || "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function submissionsToCsv(fields: FormField[], submissions: FormSubmission[]): string {
  const headers = [
    "Submitted",
    "Status",
    ...fields.map((f) => f.label),
    "Lead ID",
    "UTM source",
    "UTM medium",
    "UTM campaign",
    "Referrer",
    "Error",
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = submissions.map((s) =>
    [
      new Date(s.createdAt).toISOString(),
      FORM_SUBMISSION_STATUS_LABELS[s.status] || s.status,
      ...fields.map((f) => formatAnswerValue(s.answers?.[f.key])),
      s.leadId ? String(s.leadId) : "",
      s.utm?.source || "",
      s.utm?.medium || "",
      s.utm?.campaign || "",
      s.referrer || "",
      s.error || "",
    ]
      .map((cell) => escape(String(cell)))
      .join(","),
  );
  return [headers.map(escape).join(","), ...rows].join("\n");
}
