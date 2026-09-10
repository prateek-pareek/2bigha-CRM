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
  options?: string[];
  mapsTo?: FormFieldLeadTarget;
  order: number;
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
  submissionCount: number;
  lastSubmissionAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type FormSubmission = {
  _id: string;
  formId: string;
  formName?: string;
  answers: Record<string, unknown>;
  leadId?: string;
  status: "created_lead" | "merged_into_existing" | "failed";
  error?: string;
  referrer?: string;
  utm?: Record<string, string>;
  createdAt: string;
};

export type PublicForm = {
  _id: string;
  name: string;
  description?: string;
  fields: Array<Pick<FormField, "key" | "label" | "type" | "required" | "placeholder" | "options">>;
  submitButtonLabel: string;
  accentColor?: string;
};

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
  page = 1,
  limit = 25,
): Promise<{ items: FormSubmission[]; total: number }> {
  const res = await api.get(`/crm/forms/${id}/submissions`, { params: { page, limit } });
  return res.data;
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
): Promise<{ success: true; successMessage: string; redirectUrl?: string }> {
  const res = await api.post(`/forms/public/${id}/submit`, { answers, utm });
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
