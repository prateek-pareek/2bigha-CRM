"use client";

import { Plus } from "lucide-react";
import { WorkflowFilterRow, type WorkflowFilterRowValue } from "@/components/crm/automation/workflows/WorkflowFilterRow";
import { WORKFLOW_OPERATORS } from "@/lib/crm/automation/workflow-field-presets";
import type { WorkflowCanvasEntityKind } from "@/lib/crm/automation/workflow-field-presets";
import type { WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";
import {
  emptyEventFilter,
  emptyPropertyFilter,
  emptySegmentFilter,
} from "@/lib/crm/automation/workflow-filter-utils";

type Props = {
  filters: WorkflowFilterRowValue[];
  onChange: (filters: WorkflowFilterRowValue[]) => void;
  entityKind: WorkflowCanvasEntityKind;
  pipelines: WorkflowCanvasPipelineOption[];
  variant?: "form" | "goal" | "canvas";
  nodrag?: boolean;
  showEventFilters?: boolean;
  showSegmentFilters?: boolean;
  /** Hide add buttons when only viewing */
  readOnly?: boolean;
  removeLabel?: string;
};

/**
 * Configurable WHEN block: property, segment, and email engagement rules (AND).
 */
export function WorkflowFilterList({
  filters,
  onChange,
  entityKind,
  pipelines,
  variant = "form",
  nodrag = false,
  showEventFilters = true,
  showSegmentFilters,
  readOnly = false,
  removeLabel = "Remove",
}: Props) {
  const segmentEnabled =
    showSegmentFilters ?? (entityKind === "lead" || entityKind === "contact");

  const patch = (index: number, next: WorkflowFilterRowValue) => {
    const copy = [...filters];
    copy[index] = next;
    onChange(copy);
  };

  const remove = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const add = (row: WorkflowFilterRowValue) => {
    onChange([...filters, row]);
  };

  const addBtnClass =
    variant === "canvas"
      ? "text-[9px] font-bold text-violet-700 hover:underline"
      : variant === "goal"
        ? "text-xs font-semibold text-emerald-700 hover:underline"
        : "text-sm font-semibold text-primary hover:text-primary-dark";

  return (
    <div className="space-y-2">
      {filters.map((row, i) => (
        <div
          key={i}
          className={
            variant === "canvas"
              ? "rounded-lg border border-violet-100/80 bg-white/60 p-1"
              : "flex flex-wrap gap-2 items-end"
          }
        >
          <WorkflowFilterRow
            row={row}
            onChange={(next) => patch(i, next)}
            entityKind={entityKind}
            pipelines={pipelines}
            operators={WORKFLOW_OPERATORS}
            variant={variant}
            nodrag={nodrag}
            showEventFilters={showEventFilters}
            showSegmentFilters={segmentEnabled}
          />
          {!readOnly && filters.length > 0 && (
            <button
              type="button"
              className={
                variant === "canvas"
                  ? "nodrag nopan text-[8px] font-bold text-rose-600 hover:underline ml-1"
                  : "text-rose-600 text-sm px-2 shrink-0"
              }
              onClick={() => remove(i)}
            >
              {variant === "canvas" ? "Remove rule" : removeLabel}
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className={`flex flex-wrap gap-2 items-center ${variant === "canvas" ? "pt-0.5" : ""}`}>
          <button
            type="button"
            className={`inline-flex items-center gap-1 ${addBtnClass}`}
            onClick={() => add(emptyPropertyFilter())}
          >
            <Plus size={variant === "canvas" ? 10 : 14} /> Property rule
          </button>
          {segmentEnabled && (
            <button
              type="button"
              className={addBtnClass}
              onClick={() => add(emptySegmentFilter())}
            >
              + Segment rule
            </button>
          )}
          {showEventFilters && (
            <button
              type="button"
              className={addBtnClass}
              onClick={() => add(emptyEventFilter())}
            >
              + Email rule
            </button>
          )}
        </div>
      )}
    </div>
  );
}
