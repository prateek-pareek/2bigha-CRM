/** sessionStorage key — list page modal → `/workflows/new` editor reads once then clears. */
export const WORKFLOW_CREATE_PREFILL_KEY = "crm.workflow.createPrefill";

export type WorkflowCreatePrefill = {
  name?: string;
  description?: string;
  trigger?: string;
  enrollmentPolicy?: "once" | "every_time";
  enabled?: boolean;
  editorMode?: "branches" | "canvas";
};
