"use client";

import { useEffect, useState } from "react";
import { fetchCrmSegments, type CrmSegment } from "@/lib/crm/segments";
import type { WorkflowCanvasEntityKind } from "@/lib/crm/automation/workflow-field-presets";

function ndClass(nodrag: boolean, base: string) {
  return nodrag ? `${base} nodrag nopan` : base;
}

/** Pick a static segment list for add/remove segment workflow actions. */
export function WorkflowSegmentActionFields({
  segmentId,
  onChange,
  entityKind,
  variant = "form",
  nodrag = false,
}: {
  segmentId: string;
  onChange: (patch: { segmentId?: string }) => void;
  entityKind: WorkflowCanvasEntityKind;
  variant?: "form" | "canvas";
  nodrag?: boolean;
}) {
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCrmSegments()
      .then((rows) => {
        if (!cancelled) {
          setSegments(rows.filter((s) => s.listType === "static"));
        }
      })
      .catch(() => {
        if (!cancelled) setSegments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectClass = ndClass(
    nodrag,
    variant === "canvas"
      ? "w-full rounded-lg border border-[var(--border-color)] px-1 py-0.5 text-xs"
      : "border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full",
  );

  if (entityKind !== "lead" && entityKind !== "contact") {
    return (
      <p className="text-xs text-amber-800/90">
        Segment actions apply to lead and contact workflows only.
      </p>
    );
  }

  const select = (
    <select
      className={selectClass}
      value={segmentId}
      onChange={(e) => onChange({ segmentId: e.target.value })}
      disabled={loading}
    >
      <option value="">{loading ? "Loading segments…" : "— Static segment —"}</option>
      {segments.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );

  const hint = (
    <p className="text-[10px] text-slate-500 leading-snug">
      Static lists only. For rule-based lists, use a dynamic segment — membership updates automatically when records match filters.
    </p>
  );

  if (variant === "canvas") {
    return (
      <div className="space-y-0.5">
        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wide">Segment</p>
        {select}
        {hint}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Static segment</span>
        <div className="mt-0.5">{select}</div>
      </label>
      {hint}
    </div>
  );
}
