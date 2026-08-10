import type { CrmModuleKey } from "@/lib/crm/crm-field-layout";
import type { WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";
import {
  workflowPipesForKind,
  type WorkflowCanvasEntityKind,
} from "@/lib/crm/workflow-field-presets";

export function recordTypeToCrmModule(
  recordType: string,
): CrmModuleKey | null {
  if (recordType === "Lead") return "leads";
  if (recordType === "Deal") return "deals";
  if (recordType === "Contact") return "contacts";
  return null;
}

function recordTypeToWorkflowKind(
  recordType: string,
): WorkflowCanvasEntityKind {
  if (recordType === "Lead") return "lead";
  if (recordType === "Deal") return "deal";
  if (recordType === "Contact") return "contact";
  return "any";
}

const LEAD_STATUS_OPTIONS = ["New", "Qualified", "Replied", "Opportunity"];
const NO_EMPLOYEES_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "500+"];
const GENDER_OPTIONS = ["Male", "Female", "Other"];
const SALUTATION_OPTIONS = ["Mr", "Ms", "Mrs", "Dr"];

export type PlaybookRecommendationPicklist =
  | { mode: "strings"; options: string[] }
  | { mode: "pipelines"; options: { id: string; label: string }[] }
  | null;

export function allSalesStageNameOptions(
  pipelines: WorkflowCanvasPipelineOption[],
): string[] {
  const leadPipes = pipelines.filter((p) => p.type === "leads");
  const dealPipes = pipelines.filter((p) => p.type === "deals" || p.type == null);
  const names = new Set<string>();
  for (const p of [...leadPipes, ...dealPipes]) {
    for (const s of p.stages || []) {
      if (s?.name) names.add(String(s.name));
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function getRecommendationPicklist(
  recordType: "Lead" | "Deal" | "Contact",
  fieldPath: string,
  pipelines: WorkflowCanvasPipelineOption[],
  customField?: { type: string; options?: string[] } | null,
): PlaybookRecommendationPicklist {
  const path = fieldPath.trim();

  if (path.startsWith("customFields.")) {
    const t = String(customField?.type || "").toLowerCase();
    const isPicklistType =
      t === "select" ||
      t === "multiselect" ||
      t === "dropdown" ||
      t.includes("select");
    if (
      isPicklistType &&
      Array.isArray(customField?.options) &&
      customField.options.length
    ) {
      return { mode: "strings", options: [...customField.options] };
    }
    return null;
  }

  const wfKind = recordTypeToWorkflowKind(recordType);

  if (path === "stage") {
    const pipes =
      recordType === "Contact"
        ? pipelines.filter((p) => p.type === "leads")
        : workflowPipesForKind(wfKind, pipelines);
    const names = Array.from(
      new Set(
        pipes.flatMap((p) =>
          (p.stages || []).map((s) => s.name).filter(Boolean),
        ),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return names.length ? { mode: "strings", options: names } : null;
  }

  if (path === "pipeline") {
    const pipes =
      recordType === "Contact"
        ? pipelines.filter((p) => p.type === "leads")
        : workflowPipesForKind(wfKind, pipelines);
    if (!pipes.length) return null;
    return {
      mode: "pipelines",
      options: pipes.map((p) => ({
        id: String(p._id),
        label: p.name || String(p._id),
      })),
    };
  }

  if (path === "status" && (recordType === "Lead" || recordType === "Contact")) {
    return { mode: "strings", options: [...LEAD_STATUS_OPTIONS] };
  }

  if (path === "noOfEmployees") {
    return { mode: "strings", options: [...NO_EMPLOYEES_OPTIONS] };
  }

  if (path === "gender" && (recordType === "Lead" || recordType === "Contact")) {
    return { mode: "strings", options: [...GENDER_OPTIONS] };
  }

  if (
    path === "salutation" &&
    (recordType === "Lead" || recordType === "Contact")
  ) {
    return { mode: "strings", options: [...SALUTATION_OPTIONS] };
  }

  return null;
}
