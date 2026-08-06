"use client";

import { useParams } from "next/navigation";
import { WorkflowEditorContent } from "@/components/crm/automation/workflows/workflow-editor-content";

export default function WorkflowEditorPage() {
  const params = useParams();
  const workflowId = typeof params.workflowId === "string" ? params.workflowId : "";

  if (!workflowId) {
    return null;
  }

  return <WorkflowEditorContent workflowId={workflowId} />;
}
