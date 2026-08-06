export const WORKFLOW_CANVAS_START_ID = '__start__';

/**
 * Synthetic traversal target when "Wait · email open" has only a No (timeout) edge:
 * if the email is opened, resume here and end without running a Yes branch.
 */
export const WORKFLOW_EMAIL_WAIT_OPEN_END_ID = '__wf_wait_email_open_end__';

/** Stored workflow canvas (API shape, matches portal graph export). */
export type WorkflowCanvasNode = {
  id: string;
  type:
    | 'wf_action'
    | 'wf_delay'
    | 'wf_condition'
    | 'wf_ab_split'
    | 'wf_wait_email_engagement';
  action?: Record<string, unknown>;
  days?: number;
  hours?: number;
  minutes?: number;
  filters?: Record<string, unknown>[];
  /** 0–100: percent of traffic to branch “a” */
  splitPercentA?: number;
  /** @deprecated Prefer `waitTotalMinutes`. Max hours to wait for an open (legacy graphs). */
  waitHours?: number;
  /** Max minutes to wait for an open before following the No branch (1–10080). */
  waitTotalMinutes?: number;
  /** How often to check opens (minutes). */
  pollMinutes?: number;
};

export type WorkflowCanvasEdge = {
  id: string;
  source: string;
  target: string;
  branch?: 'default' | 'yes' | 'no' | 'a' | 'b';
};

export type WorkflowCanvasGraph = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
};

export type WorkflowGoalConfig = {
  enabled: boolean;
  label?: string;
  filters: Record<string, unknown>[];
};
