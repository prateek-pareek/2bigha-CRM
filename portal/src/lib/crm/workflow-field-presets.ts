import type { WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";
import { getFieldDefsForModule, type CrmFieldDef } from "@/lib/crm/crm-field-layout";

/** Entity kind derived from workflow trigger — used for field presets & value dropdowns. */
export type WorkflowCanvasEntityKind = "lead" | "deal" | "contact" | "org" | "any";

export type WorkflowCustomFieldDef = {
  key: string;
  name: string;
  type: string;
  options?: string[];
};

export type WorkflowFieldValueKind =
  | "pipeline"
  | "stage"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "text";

export type WorkflowFieldOption = {
  field: string;
  label: string;
  valueKind: WorkflowFieldValueKind;
  options?: string[];
};

/** Dropdown values for built-in CRM fields in workflow Set property / filters. */
export const WORKFLOW_BUILTIN_VALUE_OPTIONS: Record<string, string[]> = {
  status: ["New", "Open", "Qualified", "Unqualified", "Won", "Lost", "Active", "Inactive"],
  source: ["Website", "Referral", "Email", "Call", "LinkedIn", "Campaign", "Manual"],
  gender: ["Male", "Female", "Other"],
  territory: ["North", "South", "East", "West"],
  currency: ["USD", "EUR", "INR", "GBP", "AED"],
  salutation: ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."],
};

const NUMBER_FIELDS = new Set([
  "dealValue",
  "probability",
  "leadScore",
  "annualRevenue",
  "noOfEmployees",
  "exchangeRate",
  "expectedDealValue",
]);

function inferBuiltinValueKind(field: string): WorkflowFieldValueKind {
  if (field === "pipeline") return "pipeline";
  if (field === "stage") return "stage";
  if (NUMBER_FIELDS.has(field)) return "number";
  if (WORKFLOW_BUILTIN_VALUE_OPTIONS[field]?.length) return "select";
  return "text";
}

function customFieldValueKind(type: string): WorkflowFieldValueKind {
  const t = (type || "").toLowerCase();
  if (t === "select" || t === "multiselect") return "select";
  if (t === "number") return "number";
  if (t === "checkbox") return "boolean";
  if (t === "date") return "date";
  return "text";
}

function defsToPresets(defs: CrmFieldDef[]): { field: string; label: string }[] {
  return defs
    .filter((d) => !d.recordOnly)
    .map((d) => ({ field: d.key, label: d.label }));
}

function withExtras(
  base: { field: string; label: string }[],
  extras: { field: string; label: string }[],
): { field: string; label: string }[] {
  const seen = new Set<string>();
  const out: { field: string; label: string }[] = [];
  for (const row of [...base, ...extras]) {
    if (!row.field || seen.has(row.field)) continue;
    seen.add(row.field);
    out.push(row);
  }
  return out;
}

export const WORKFLOW_FIELD_PRESETS: Record<
  WorkflowCanvasEntityKind,
  { field: string; label: string }[]
> = {
  lead: withExtras(defsToPresets(getFieldDefsForModule("leads")), [
    { field: "emailTrackingSubject", label: "Email subject (tracked send)" },
    { field: "emailClickedUrl", label: "Clicked URL (engagement)" },
  ]),
  deal: withExtras(defsToPresets(getFieldDefsForModule("deals")), [
    { field: "emailTrackingSubject", label: "Email subject (tracked send)" },
    { field: "emailClickedUrl", label: "Clicked URL (engagement)" },
  ]),
  contact: withExtras(defsToPresets(getFieldDefsForModule("contacts")), [
    { field: "emailTrackingSubject", label: "Email subject (tracked send)" },
    { field: "emailClickedUrl", label: "Clicked URL (engagement)" },
  ]),
  org: withExtras(defsToPresets(getFieldDefsForModule("organizations")), [
    { field: "emailTrackingSubject", label: "Email subject (tracked send)" },
    { field: "emailClickedUrl", label: "Clicked URL (engagement)" },
  ]),
  any: [
    { field: "stage", label: "Stage" },
    { field: "pipeline", label: "Pipeline" },
    { field: "email", label: "Email" },
  ],
};

export function entityKindToCustomFieldModule(
  entityKind: WorkflowCanvasEntityKind,
): string | null {
  switch (entityKind) {
    case "lead":
      return "leads";
    case "deal":
      return "deals";
    case "contact":
      return "contacts";
    case "org":
      return "organizations";
    default:
      return null;
  }
}

export function buildWorkflowFieldOptions(
  entityKind: WorkflowCanvasEntityKind,
  customFields: WorkflowCustomFieldDef[] = [],
  opts?: { canViewCrmRevenue?: boolean },
): WorkflowFieldOption[] {
  const canView = opts?.canViewCrmRevenue !== false;
  const moneyFields = new Set([
    "dealValue",
    "expectedDealValue",
    "annualRevenue",
    "currency",
    "exchangeRate",
  ]);
  const base = WORKFLOW_FIELD_PRESETS[entityKind] ?? WORKFLOW_FIELD_PRESETS.any;
  const builtins: WorkflowFieldOption[] = base
    .filter((p) => canView || !moneyFields.has(p.field))
    .map((p) => ({
      field: p.field,
      label: p.label,
      valueKind: inferBuiltinValueKind(p.field),
      options: WORKFLOW_BUILTIN_VALUE_OPTIONS[p.field],
    }));
  const custom: WorkflowFieldOption[] = customFields.map((cf) => ({
    field: `customFields.${cf.key}`,
    label: `${cf.name} (custom)`,
    valueKind: customFieldValueKind(cf.type),
    options: cf.options?.length ? cf.options : undefined,
  }));
  return [...builtins, ...custom];
}

export function findWorkflowFieldOption(
  field: string,
  entityKind: WorkflowCanvasEntityKind,
  customFields: WorkflowCustomFieldDef[] = [],
  opts?: { canViewCrmRevenue?: boolean },
): WorkflowFieldOption | undefined {
  return buildWorkflowFieldOptions(entityKind, customFields, opts).find(
    (o) => o.field === field,
  );
}

export function workflowPipesForKind(
  entityKind: WorkflowCanvasEntityKind,
  pipelines: WorkflowCanvasPipelineOption[],
): WorkflowCanvasPipelineOption[] {
  const leadPipes = pipelines.filter((p) => p.type === "leads");
  const dealPipes = pipelines.filter((p) => p.type === "deals" || p.type == null);
  if (entityKind === "lead") return leadPipes;
  if (entityKind === "deal") return dealPipes;
  return [...leadPipes, ...dealPipes];
}

export function workflowStageNamesForKind(
  entityKind: WorkflowCanvasEntityKind,
  pipelines: WorkflowCanvasPipelineOption[],
  pipelineId?: string,
): string[] {
  let pipes = workflowPipesForKind(entityKind, pipelines);
  if (pipelineId) {
    const scoped = pipes.filter((p) => p._id === pipelineId);
    if (scoped.length) pipes = scoped;
  }
  return Array.from(
    new Set(pipes.flatMap((p) => (p.stages || []).map((s) => s.name).filter(Boolean))),
  ).sort();
}

/** Shared operator list for entry criteria, branches, goals, canvas conditions */
export const WORKFLOW_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is known" },
  { value: "changed_to", label: "changed to" },
  { value: "changed_from_to", label: "changed from -> to" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "in_list", label: "is any of (comma list)" },
  { value: "not_in_list", label: "is none of (comma list)" },
] as const;

export const WORKFLOW_SEGMENT_OPERATORS = [
  { value: "in_segment", label: "is in segment" },
  { value: "not_in_segment", label: "is not in segment" },
] as const;
