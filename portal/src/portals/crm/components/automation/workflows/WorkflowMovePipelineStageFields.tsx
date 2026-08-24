"use client";

import {
  workflowPipesForKind,
  workflowStageNamesForKind,
  type WorkflowCanvasEntityKind,
} from "@/lib/crm/automation/workflow-field-presets";
import type { WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";

function ndClass(nodrag: boolean, base: string) {
  return nodrag ? `${base} nodrag nopan` : base;
}

/** Move a lead to a pipeline and stage in one workflow action. */
export function WorkflowMovePipelineStageFields({
  pipelineId,
  stage,
  onChange,
  entityKind,
  pipelines,
  variant = "form",
  nodrag = false,
}: {
  pipelineId: string;
  stage: string;
  onChange: (patch: { pipelineId?: string; stage?: string }) => void;
  entityKind: WorkflowCanvasEntityKind;
  pipelines: WorkflowCanvasPipelineOption[];
  variant?: "form" | "canvas";
  nodrag?: boolean;
}) {
  const pipesForKind = workflowPipesForKind(entityKind, pipelines);
  const stageNames = workflowStageNamesForKind(entityKind, pipelines, pipelineId);
  const selectClass = ndClass(
    nodrag,
    variant === "canvas"
      ? "w-full rounded-lg border border-[var(--border-color)] px-1 py-0.5 text-xs"
      : "border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full",
  );

  if (entityKind !== "lead") {
    return (
      <p className="text-xs text-amber-800/90">
        Pipeline/stage moves apply to lead workflows only.
      </p>
    );
  }

  const pipelineSelect = (
    <select
      className={selectClass}
      value={pipelineId}
      onChange={(e) => onChange({ pipelineId: e.target.value, stage: "" })}
    >
      <option value="">— Pipeline —</option>
      {pipesForKind.map((p) => (
        <option key={p._id} value={p._id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  const stageSelect = (
    <select
      className={selectClass}
      value={stage}
      onChange={(e) => onChange({ stage: e.target.value })}
      disabled={!pipelineId}
    >
      <option value="">— Stage —</option>
      {stageNames.map((st) => (
        <option key={st} value={st}>
          {st}
        </option>
      ))}
    </select>
  );

  if (variant === "canvas") {
    return (
      <div className="space-y-0.5">
        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wide">Pipeline</p>
        {pipelineSelect}
        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wide pt-0.5">Stage</p>
        {stageSelect}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Pipeline</span>
        <div className="mt-0.5">{pipelineSelect}</div>
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Stage</span>
        <div className="mt-0.5">{stageSelect}</div>
      </label>
    </div>
  );
}
