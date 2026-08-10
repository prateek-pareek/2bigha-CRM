/** Aligns with api-hrms `workflow-canvas.types` + React Flow handles. */

export const WORKFLOW_FLOW_START = "__start__";

export type WorkflowCanvasPipelineOption = {
  _id: string;
  name: string;
  type?: string;
  stages?: { name: string }[];
};

export type WorkflowCanvasApiNode = {
  id: string;
  type: "wf_action" | "wf_delay" | "wf_condition" | "wf_ab_split" | "wf_wait_email_engagement";
  action?: Record<string, unknown>;
  days?: number;
  hours?: number;
  minutes?: number;
  filters?: {
    field: string;
    operator: string;
    value?: string | number | boolean;
    filterKind?: "property" | "event" | "segment";
    eventType?: "crm_email_has_been_opened" | "crm_email_sent_but_never_opened";
  }[];
  splitPercentA?: number;
  /** @deprecated Prefer `waitTotalMinutes`. */
  waitHours?: number;
  /** Max minutes to wait for an open (Yes) vs timeout (No). */
  waitTotalMinutes?: number;
  pollMinutes?: number;
};

export type WorkflowCanvasApiEdge = {
  id: string;
  source: string;
  target: string;
  branch?: "default" | "yes" | "no" | "a" | "b";
};

export type WorkflowCanvasApiGraph = {
  nodes: WorkflowCanvasApiNode[];
  edges: WorkflowCanvasApiEdge[];
};

export function emptyGraph(): WorkflowCanvasApiGraph {
  return { nodes: [], edges: [] };
}
