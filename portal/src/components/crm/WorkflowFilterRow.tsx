"use client";

import { useState, useEffect, useRef } from "react";
import {
  WORKFLOW_BUILTIN_VALUE_OPTIONS,
  WORKFLOW_FIELD_PRESETS,
  WORKFLOW_SEGMENT_OPERATORS,
  workflowPipesForKind,
  workflowStageNamesForKind,
  type WorkflowCanvasEntityKind,
} from "@/lib/crm/workflow-field-presets";
import type { WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";
import { fetchCrmSegments, type CrmSegment } from "@/lib/crm/segments";

/** Custom themed dropdown — orange hover, no native blue */
function ThemedSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-1.5 border border-border/60 bg-surface-dim/30 rounded-[3px] px-3 py-2 text-sm font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all cursor-pointer hover:border-primary/30 hover:bg-primary/5 min-w-0"
      >
        <span className="truncate">{selected?.label ?? placeholder ?? "Select..."}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <ul className="absolute z-50 mt-1 min-w-full w-max max-w-[260px] max-h-56 overflow-y-auto rounded-[3px] border border-border bg-card shadow-lg py-1">
          {placeholder && (
            <li>
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm font-medium transition-colors ${value === "" ? "bg-primary/10 text-primary font-semibold" : "text-text-muted hover:bg-primary/5 hover:text-primary"}`}
              >
                {placeholder}
              </button>
            </li>
          )}
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm font-medium transition-colors ${opt.value === value ? "bg-primary/10 text-primary font-semibold" : "text-text-main hover:bg-primary/5 hover:text-primary"}`}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type WorkflowFilterRowValue = {
  field: string;
  operator: string;
  value?: string | number | boolean;
  filterKind?: "property" | "event" | "segment";
  eventType?: "crm_email_has_been_opened" | "crm_email_sent_but_never_opened";
};

const NEEDS_VALUE = (op: string) => !["is_empty", "is_not_empty"].includes(op);
const SINGLE_SELECT_OPS = new Set(["equals", "not_equals", "changed_to"]);

type OperatorOption = { value: string; label: string };

function ndClass(nodrag: boolean, base: string) {
  return nodrag ? `${base} nodrag nopan` : base;
}

const FORM_INPUT =
  "border border-border/60 bg-surface-dim/30 rounded-[3px] px-3 py-2 text-sm font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all placeholder:text-text-muted/60";
const GOAL_INPUT =
  "border border-border/60 bg-surface-dim/30 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all placeholder:text-text-muted/60";

export function WorkflowFilterRow({
  row,
  onChange,
  entityKind,
  pipelines,
  operators,
  variant = "form",
  nodrag = false,
  showEventFilters = false,
  showSegmentFilters,
}: {
  row: WorkflowFilterRowValue;
  onChange: (next: WorkflowFilterRowValue) => void;
  entityKind: WorkflowCanvasEntityKind;
  pipelines: WorkflowCanvasPipelineOption[];
  operators: readonly OperatorOption[];
  variant?: "form" | "goal" | "canvas";
  nodrag?: boolean;
  /** Email open / not-opened engagement rules (workflows entry, branches, canvas IF). */
  showEventFilters?: boolean;
  /** Segment membership rules (lead/contact workflows). */
  showSegmentFilters?: boolean;
}) {
  const kind = row.filterKind || "property";
  const segmentFiltersEnabled =
    showSegmentFilters ?? (entityKind === "lead" || entityKind === "contact");
  const [segments, setSegments] = useState<CrmSegment[]>([]);

  useEffect(() => {
    if (!segmentFiltersEnabled) return;
    let cancelled = false;
    fetchCrmSegments()
      .then((rows) => {
        if (!cancelled) setSegments(rows);
      })
      .catch(() => {
        if (!cancelled) setSegments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [segmentFiltersEnabled]);

  const filterKindOptions = [
    { value: "property", label: "Property" },
    ...(showEventFilters ? [{ value: "event", label: "Email engagement" }] : []),
    ...(segmentFiltersEnabled ? [{ value: "segment", label: "Segment" }] : []),
  ];

  const applyFilterKind = (k: string) => {
    if (k === "event") {
      onChange({
        ...row,
        filterKind: "event",
        eventType: row.eventType || "crm_email_has_been_opened",
        field: "_event",
        operator: "equals",
        value: true,
      });
      return;
    }
    if (k === "segment") {
      onChange({
        ...row,
        filterKind: "segment",
        eventType: undefined,
        field: "_segment",
        operator: row.operator === "not_in_segment" ? "not_in_segment" : "in_segment",
        value: row.value ?? "",
      });
      return;
    }
    onChange({
      ...row,
      filterKind: "property",
      eventType: undefined,
      field: row.field === "_event" || row.field === "_segment" ? "" : row.field,
      operator: row.operator === "in_segment" || row.operator === "not_in_segment" ? "equals" : row.operator,
    });
  };

  const kindSelect = showEventFilters || segmentFiltersEnabled ? (
    variant === "canvas" ? (
      <select
        className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px] font-semibold")}
        value={kind}
        onChange={(e) => applyFilterKind(e.target.value)}
      >
        {filterKindOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ) : (
      <ThemedSelect
        value={kind}
        onChange={applyFilterKind}
        options={filterKindOptions}
      />
    )
  ) : null;

  const eventRuleSelect =
    kind === "event" ? (
      variant === "canvas" ? (
        <select
          className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px] font-semibold")}
          value={row.eventType || "crm_email_has_been_opened"}
          onChange={(e) => {
            const eventType = e.target.value as WorkflowFilterRowValue["eventType"];
            onChange({
              ...row,
              filterKind: "event",
              eventType,
              field: "_event",
              operator: "equals",
              value: true,
            });
          }}
        >
          <option value="crm_email_has_been_opened">Has opened a tracked CRM email</option>
          <option value="crm_email_sent_but_never_opened">Tracked email sent but not opened yet</option>
        </select>
      ) : (
        <ThemedSelect
          value={row.eventType || "crm_email_has_been_opened"}
          onChange={(eventType) => {
            onChange({
              ...row,
              filterKind: "event",
              eventType: eventType as WorkflowFilterRowValue["eventType"],
              field: "_event",
              operator: "equals",
              value: true,
            });
          }}
          options={[
            { value: "crm_email_has_been_opened", label: "Has opened a tracked CRM email" },
            { value: "crm_email_sent_but_never_opened", label: "Tracked email sent but not opened yet" },
          ]}
          className="flex-1"
        />
      )
    ) : null;

  const presets = WORKFLOW_FIELD_PRESETS[entityKind] ?? WORKFLOW_FIELD_PRESETS.any;
  const preset = presets.find((p) => p.field === row.field);
  const op = row.operator || "equals";
  const pipesForKind = workflowPipesForKind(entityKind, pipelines);
  const stageNames = workflowStageNamesForKind(entityKind, pipelines);

  const fieldSelectOptions = [
    ...presets.map((p) => ({ value: p.field, label: p.label })),
    { value: "__custom__", label: "Custom field..." },
  ];

  const fieldSelect =
    variant === "canvas" ? (
      <select
        className={ndClass(nodrag, "flex-1 min-w-0 rounded border border-violet-100 px-0.5 py-0.5 text-[9px] font-semibold")}
        value={preset ? row.field : "__custom__"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            onChange({ ...row, field: "", value: "" });
          } else {
            onChange({ ...row, field: v, value: v === "pipeline" ? "" : row.value });
          }
        }}
      >
        {presets.map((p) => (
          <option key={p.field} value={p.field}>
            {p.label}
          </option>
        ))}
        <option value="__custom__">Custom field...</option>
      </select>
    ) : (
      <ThemedSelect
        value={preset ? row.field : "__custom__"}
        onChange={(v) => {
          if (v === "__custom__") {
            onChange({ ...row, field: "", value: "" });
          } else {
            onChange({ ...row, field: v, value: v === "pipeline" ? "" : row.value });
          }
        }}
        options={fieldSelectOptions}
      />
    );

  const customFieldInput = !preset && (
    <input
      className={ndClass(
        nodrag,
        variant === "canvas"
          ? "flex-1 min-w-[48px] rounded border border-violet-100 px-0.5 py-0.5 text-[9px]"
          : variant === "goal"
            ? `flex-1 min-w-[80px] ${GOAL_INPUT}`
            : `flex-1 min-w-[120px] ${FORM_INPUT}`,
      )}
      placeholder="field name"
      value={row.field}
      onChange={(e) => onChange({ ...row, field: e.target.value })}
    />
  );

  const operatorSelect =
    variant === "canvas" ? (
      <select
        className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px]")}
        value={op}
        onChange={(e) => onChange({ ...row, operator: e.target.value })}
      >
        {operators.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ) : (
      <ThemedSelect
        value={op}
        onChange={(v) => onChange({ ...row, operator: v })}
        options={operators.map((o) => ({ value: o.value, label: o.label }))}
      />
    );

  const presetOptions = WORKFLOW_BUILTIN_VALUE_OPTIONS[row.field] || [];

  const valueControl =
    NEEDS_VALUE(op) &&
    (row.field === "pipeline" && pipesForKind.length > 0 ? (
      variant === "canvas" ? (
        <select
          className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px]")}
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
        >
          <option value="">— Pipeline —</option>
          {pipesForKind.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <ThemedSelect
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(v) => onChange({ ...row, value: v })}
          options={pipesForKind.map((p) => ({ value: p._id, label: p.name }))}
          placeholder="— Pipeline —"
          className="flex-1 min-w-[100px]"
        />
      )
    ) : row.field === "stage" && stageNames.length > 0 ? (
      variant === "canvas" ? (
        <select
          className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px]")}
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
        >
          <option value="">— Stage —</option>
          {stageNames.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      ) : (
        <ThemedSelect
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(v) => onChange({ ...row, value: v })}
          options={stageNames.map((st) => ({ value: st, label: st }))}
          placeholder="— Stage —"
          className="flex-1 min-w-[100px]"
        />
      )
    ) : row.field === "dealValue" || row.field === "probability" ? (
      <input
        type="number"
        className={ndClass(
          nodrag,
          variant === "canvas"
            ? "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px]"
            : variant === "goal"
              ? `flex-1 min-w-[60px] ${GOAL_INPUT}`
              : `flex-1 min-w-[100px] ${FORM_INPUT}`,
        )}
        placeholder={row.field === "probability" ? "%" : "Amount"}
        value={row.value === undefined || row.value === "" ? "" : String(row.value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...row, value: v === "" ? "" : Number(v) });
        }}
      />
    ) : presetOptions.length > 0 && SINGLE_SELECT_OPS.has(op) ? (
      variant === "canvas" ? (
        <select
          className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px]")}
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
        >
          <option value="">— Select —</option>
          {presetOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <ThemedSelect
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(v) => onChange({ ...row, value: v })}
          options={presetOptions.map((opt) => ({ value: opt, label: opt }))}
          placeholder="— Select —"
          className="flex-1 min-w-[100px]"
        />
      )
    ) : (
      <input
        className={ndClass(
          nodrag,
          variant === "canvas"
            ? "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px]"
            : variant === "goal"
              ? `flex-1 min-w-[60px] ${GOAL_INPUT}`
              : `flex-1 min-w-[100px] ${FORM_INPUT}`,
        )}
        placeholder={
          op === "in_list" || op === "not_in_list"
            ? "comma-separated"
            : op === "changed_from_to"
              ? "old => new"
              : "value"
        }
        value={row.value === undefined ? "" : String(row.value)}
        onChange={(e) => {
          const v = e.target.value;
          onChange({
            ...row,
            value: v === "" ? "" : isNaN(Number(v)) ? v : Number(v),
          });
        }}
      />
    ));

  if (kind === "segment" && segmentFiltersEnabled) {
    const segmentSelect =
      variant === "canvas" ? (
        <select
          className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px] font-semibold")}
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
        >
          <option value="">— Segment —</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.listType})
            </option>
          ))}
        </select>
      ) : (
        <ThemedSelect
          value={row.value === undefined ? "" : String(row.value)}
          onChange={(v) => onChange({ ...row, value: v })}
          options={segments.map((s) => ({
            value: s.id,
            label: `${s.name} (${s.listType})`,
          }))}
          placeholder="— Segment —"
          className="flex-1 min-w-[140px]"
        />
      );
    const opSelect =
      variant === "canvas" ? (
        <select
          className={ndClass(nodrag, "w-full rounded border border-violet-100 px-0.5 py-0.5 text-[9px] font-semibold")}
          value={row.operator || "in_segment"}
          onChange={(e) => onChange({ ...row, operator: e.target.value })}
        >
          {WORKFLOW_SEGMENT_OPERATORS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <ThemedSelect
          value={row.operator || "in_segment"}
          onChange={(v) => onChange({ ...row, operator: v })}
          options={[...WORKFLOW_SEGMENT_OPERATORS]}
          className="flex-1 min-w-[120px]"
        />
      );
    const segmentHelp = (
      <p className={variant === "canvas" ? "text-[8px] text-violet-800/90 leading-snug" : "text-xs text-text-muted max-w-md"}>
        Static and dynamic segments supported. Dynamic lists match saved filter rules automatically.
      </p>
    );
    if (variant === "canvas") {
      return (
        <div className="rounded-lg border border-violet-100 bg-white/80 p-1.5 space-y-0.5">
          {kindSelect}
          {opSelect}
          {segmentSelect}
          {segmentHelp}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2 w-full max-w-xl">
        <div className="flex flex-wrap gap-2 items-end">
          {kindSelect}
          {opSelect}
          {segmentSelect}
        </div>
        {segmentHelp}
      </div>
    );
  }

  if (kind === "event" && showEventFilters) {
    const eventHelp =
      variant === "canvas" ? (
        <p className="text-[8px] text-violet-800/90 leading-snug">
          Uses inbox / workflow sends with tracking. "Not opened" requires at least one tracked send.
        </p>
      ) : (
        <p className="text-xs text-text-muted max-w-md">
          Uses tracked CRM sends (pixel). "Not opened yet" applies when a tracked email exists but has no opens.
        </p>
      );
    if (variant === "canvas") {
      return (
        <div className="rounded-lg border border-violet-100 bg-white/80 p-1.5 space-y-0.5">
          {kindSelect}
          {eventRuleSelect}
          {eventHelp}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2 w-full max-w-xl">
        <div className="flex flex-wrap gap-2 items-end">
          {kindSelect}
          {eventRuleSelect}
        </div>
        {eventHelp}
      </div>
    );
  }

  if (variant === "canvas") {
    return (
      <div className="rounded-lg border border-violet-100 bg-white/80 p-1.5 space-y-0.5">
        {kindSelect}
        <div className="flex items-center gap-0.5">
          {fieldSelect}
          {customFieldInput}
        </div>
        {operatorSelect}
        {valueControl}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-xl">
      {kindSelect ? <div className="flex flex-wrap gap-2 items-end">{kindSelect}</div> : null}
      <div className="flex flex-wrap gap-2 items-end">
        {fieldSelect}
        {customFieldInput}
        {operatorSelect}
        {valueControl}
      </div>
    </div>
  );
}
