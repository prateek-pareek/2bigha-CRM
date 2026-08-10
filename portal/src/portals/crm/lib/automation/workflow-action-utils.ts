export type WorkflowActionDraft = Record<string, unknown>;

export function validateWorkflowAction(action: WorkflowActionDraft): string | null {
  const t = String(action.type || "");
  if (t === "move_pipeline_stage") {
    if (!String(action.pipelineId || "").trim()) {
      return "Move pipeline & stage: pick a pipeline";
    }
    if (!String(action.stage || "").trim()) {
      return "Move pipeline & stage: pick a stage";
    }
  }
  if (t === "add_to_segment" || t === "remove_from_segment") {
    if (!String(action.segmentId || "").trim()) {
      return `${t === "add_to_segment" ? "Add" : "Remove"} segment: pick a static segment list`;
    }
  }
  if (t === "set_property") {
    if (!String(action.field || "").trim()) {
      return "Set property: choose a field";
    }
  }
  if (t === "send_email_template") {
    const mode = action.sendMode === "ai_draft" ? "ai_draft" : "template";
    if (mode === "template" && !String(action.templateId || "").trim()) {
      return "Send email: choose a template";
    }
  }
  if (t === "http_webhook" && !String(action.url || "").trim()) {
    return "Webhook: enter a URL";
  }
  if (t === "notify_teams" && !String(action.email || "").trim()) {
    return "Teams notify: enter recipient email";
  }
  return null;
}

export function collectWorkflowActionIssues(
  actions: WorkflowActionDraft[],
): string[] {
  const issues: string[] = [];
  for (const action of actions) {
    const msg = validateWorkflowAction(action);
    if (msg) issues.push(msg);
  }
  return issues;
}
