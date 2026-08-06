"use client";

import { useState } from "react";
import {
  buildWorkflowFieldOptions,
  findWorkflowFieldOption,
  workflowPipesForKind,
  workflowStageNamesForKind,
  type WorkflowCanvasEntityKind,
  type WorkflowCustomFieldDef,
} from "@/lib/crm/automation/workflow-field-presets";
import type { WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";
import { usePermissions } from "@/hooks/usePermissions";

function ndClass(nodrag: boolean, base: string) {
  return nodrag ? `${base} nodrag nopan` : base;
}

type Patch = { field?: string; value?: unknown };

/**
 * Set property action: field from presets + custom properties, with context-aware value controls.
 */
export function WorkflowSetPropertyFields({
  field,
  value,
  onChange,
  entityKind,
  pipelines,
  customFields = [],
  variant = "form",
  nodrag = false,
}: {
  field: string;
  value: unknown;
  onChange: (patch: Patch) => void;
  entityKind: WorkflowCanvasEntityKind;
  pipelines: WorkflowCanvasPipelineOption[];
  customFields?: WorkflowCustomFieldDef[];
  variant?: "form" | "canvas";
  nodrag?: boolean;
}) {
  const { canViewCrmRevenue } = usePermissions();
  const fieldOptions = buildWorkflowFieldOptions(entityKind, customFields, {
    canViewCrmRevenue,
  });
  const selected =
    findWorkflowFieldOption(field, entityKind, customFields, {
      canViewCrmRevenue,
    }) ||
    (field ? { field, label: field, valueKind: "text" as const } : undefined);
  const isKnownField = fieldOptions.some((o) => o.field === field);
  const pipesForKind = workflowPipesForKind(entityKind, pipelines);
  const valueKind = selected?.valueKind ?? "text";
  const [stageScopePipelineId, setStageScopePipelineId] = useState("");
  const stageNames = workflowStageNamesForKind(
    entityKind,
    pipelines,
    valueKind === "stage" && stageScopePipelineId ? stageScopePipelineId : undefined,
  );

  const fieldSelect = (
    <select
      className={ndClass(
        nodrag,
        variant === "canvas"
          ? "w-full rounded-lg border border-[var(--border-color)] py-1 px-1 text-xs font-bold"
          : "border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full",
      )}
      value={isKnownField ? field : field ? "__custom__" : ""}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__custom__") {
          onChange({ field: "", value: "" });
        } else {
          onChange({ field: v, value: v === "pipeline" ? "" : "" });
        }
      }}
    >
      <option value="" disabled>
        — Property —
      </option>
      {fieldOptions.map((p) => (
        <option key={p.field} value={p.field}>
          {p.label}
        </option>
      ))}
      <option value="__custom__">Custom API field…</option>
    </select>
  );

  const customFieldInput = !isKnownField && (
    <input
      className={ndClass(
        nodrag,
        variant === "canvas"
          ? "w-full rounded-lg border border-[var(--border-color)] px-1 py-0.5 text-xs"
          : "border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full",
      )}
      placeholder="e.g. stage or customFields.myKey"
      value={field}
      onChange={(e) => onChange({ field: e.target.value })}
    />
  );

  const selectClass = ndClass(
    nodrag,
    variant === "canvas"
      ? "w-full rounded-lg border border-[var(--border-color)] px-1 py-0.5 text-xs"
      : "border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full",
  );
  const inputClass = selectClass;

  const valueControl = (() => {
    if (valueKind === "pipeline" && pipesForKind.length > 0) {
      return (
        <select
          className={selectClass}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange({ value: e.target.value })}
        >
          <option value="">— Pipeline —</option>
          {pipesForKind.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      );
    }
    if (valueKind === "stage" && stageNames.length > 0) {
      return (
        <div className="space-y-1">
          {pipesForKind.length > 1 && (
            <select
              className={selectClass}
              value={stageScopePipelineId}
              onChange={(e) => setStageScopePipelineId(e.target.value)}
            >
              <option value="">All pipelines (stages)</option>
              {pipesForKind.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <select
            className={selectClass}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => onChange({ value: e.target.value })}
          >
            <option value="">— Stage —</option>
            {stageNames.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (valueKind === "select" && selected?.options?.length) {
      return (
        <select
          className={selectClass}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange({ value: e.target.value })}
        >
          <option value="">— Select —</option>
          {selected.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    if (valueKind === "boolean") {
      return (
        <select
          className={selectClass}
          value={
            value === true || value === "true"
              ? "true"
              : value === false || value === "false"
                ? "false"
                : ""
          }
          onChange={(e) => {
            const v = e.target.value;
            onChange({ value: v === "" ? "" : v === "true" });
          }}
        >
          <option value="">— Yes / No —</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if (valueKind === "number") {
      return (
        <input
          type="number"
          className={inputClass}
          placeholder="Number"
          value={value === undefined || value === "" ? "" : String(value)}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ value: v === "" ? "" : Number(v) });
          }}
        />
      );
    }
    if (valueKind === "date") {
      return (
        <input
          type="date"
          className={inputClass}
          value={value === undefined || value === null ? "" : String(value).slice(0, 10)}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      );
    }
    return (
      <input
        className={inputClass}
        placeholder="Value"
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange({
            value: v === "" ? "" : isNaN(Number(v)) || v.trim() === "" ? v : Number(v),
          });
        }}
      />
    );
  })();

  if (variant === "canvas") {
    return (
      <div className="space-y-0.5">
        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wide">Property</p>
        {fieldSelect}
        {customFieldInput}
        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wide pt-0.5">Value</p>
        {valueControl}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Property</span>
        <div className="mt-0.5 space-y-2">{fieldSelect}</div>
        {customFieldInput && <div className="mt-2">{customFieldInput}</div>}
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Value</span>
        <div className="mt-0.5">{valueControl}</div>
      </label>
    </div>
  );
}
