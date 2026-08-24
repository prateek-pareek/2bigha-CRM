"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  ChevronLeft,
  X,
  Save,
  Loader2,
  GitBranch,
  PlayCircle,
  Filter,
  Split,
  LayoutGrid,
  ListTree,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import type { WorkflowCanvasEntityKind } from "@/components/crm/automation/workflows/WorkflowCanvasEditor";
import {
  entityKindToCustomFieldModule,
  type WorkflowCustomFieldDef,
} from "@/lib/crm/automation/workflow-field-presets";
import WorkflowSendEmailActionFields from "@/components/crm/automation/workflows/WorkflowSendEmailActionFields";
import { WorkflowMovePipelineStageFields } from "@/components/crm/automation/workflows/WorkflowMovePipelineStageFields";
import { WorkflowSegmentActionFields } from "@/components/crm/automation/workflows/WorkflowSegmentActionFields";
import { WorkflowSetPropertyFields } from "@/components/crm/automation/workflows/WorkflowSetPropertyFields";
import { emptyGraph, type WorkflowCanvasApiGraph, type WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";
import { WORKFLOW_CANVAS_TEMPLATES } from "@/lib/crm/workflow-templates";
import { WorkflowFilterList } from "@/components/crm/automation/workflows/WorkflowFilterList";
import {
  emptyPropertyFilter,
  isPersistableWorkflowFilter,
  normalizeWorkflowFilter,
  normalizeWorkflowFilters,
  type WorkflowFilterValue,
} from "@/lib/crm/automation/workflow-filter-utils";
import { collectWorkflowActionIssues } from "@/lib/crm/workflow-action-utils";
import {
  WORKFLOW_CREATE_PREFILL_KEY,
  type WorkflowCreatePrefill,
} from "@/lib/crm/workflow-create-prefill";

const WorkflowCanvasEditor = dynamic(
  () => import("@/components/crm/automation/workflows/WorkflowCanvasEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(50vh,420px)] min-h-[200px] items-center justify-center rounded-[var(--radius-md)] border border-violet-200/60 bg-white/90">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    ),
  },
);

function triggerEntityKind(trigger: string): WorkflowCanvasEntityKind {
  if (trigger.startsWith("lead_")) return "lead";
  if (trigger.startsWith("contact_")) return "contact";
  if (trigger.startsWith("organization_")) return "org";
  return "any";
}

const TRIGGERS = [
  { value: "manual_enrollment", label: "Manual — start from lead/contact" },
  { value: "lead_created", label: "Lead — created" },
  { value: "lead_updated", label: "Lead — updated" },
  { value: "lead_stage_changed", label: "Lead — stage changed" },
  { value: "lead_pipeline_changed", label: "Lead — pipeline changed" },
  { value: "lead_status_changed", label: "Lead — status changed" },
  { value: "lead_owner_changed", label: "Lead — owner changed" },
  {
    value: "lead_tracked_email_opened",
    label: "Lead — tracked email opened (first open)",
  },
  {
    value: "lead_tracked_email_replied",
    label: "Lead — client replied to tracked email",
  },
  { value: "contact_created", label: "Contact — created" },
  { value: "contact_updated", label: "Contact — updated" },
  { value: "contact_email_changed", label: "Contact — email changed" },
  {
    value: "contact_tracked_email_opened",
    label: "Contact — tracked email opened (first open)",
  },
  {
    value: "contact_tracked_email_replied",
    label: "Contact — client replied to tracked email",
  },
  { value: "organization_created", label: "Organization — created" },
  { value: "organization_updated", label: "Organization — updated" },
  { value: "organization_name_changed", label: "Organization — name changed" },
  {
    value: "organization_tracked_email_opened",
    label: "Organization — tracked email opened (first open)",
  },
  {
    value: "organization_tracked_email_replied",
    label: "Organization — client replied to tracked email",
  },
] as const;

function triggerFamily(prefix: string): (typeof TRIGGERS)[number][] {
  return TRIGGERS.filter((t) => t.value.startsWith(prefix));
}

const ACTION_TYPES = [
  { value: "move_pipeline_stage", label: "Move pipeline & stage" },
  { value: "set_property", label: "Set property (fields…)" },
  { value: "add_to_segment", label: "Add to segment (static list)" },
  { value: "remove_from_segment", label: "Remove from segment" },
  { value: "assign_owner", label: "Assign owner (lead)" },
  { value: "create_task", label: "Create task" },
  { value: "create_note", label: "Create note" },
  { value: "send_email_template", label: "Send email (template)" },
  { value: "notify_teams", label: "Notify via Teams" },
  { value: "http_webhook", label: "HTTP webhook" },
] as const;

type WorkflowRow = {
  _id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: string;
  triggers?: string[];
  triggerCombine?: "any" | "all";
  filters: WorkflowFilterValue[];
  actions?: Record<string, unknown>[];
  branches?: {
    label: string;
    isElse?: boolean;
    filters: WorkflowFilterValue[];
    steps: unknown[];
  }[];
  enrollmentPolicy?: "once" | "every_time";
  onlyOncePerRecord?: boolean;
  editorMode?: "branches" | "canvas";
  canvasGraph?: WorkflowCanvasApiGraph;
  goal?: {
    enabled?: boolean;
    label?: string;
    filters?: WorkflowFilterValue[];
  };
  updatedAt?: string;
};

type StepForm =
  | { kind: "delay"; days: number; hours: number; minutes: number }
  | { kind: "action"; action: Record<string, unknown> };

type BranchForm = {
  label: string;
  isElse: boolean;
  filters: WorkflowFilterValue[];
  steps: StepForm[];
};

function emptyAction(): Record<string, unknown> {
  return { type: "move_pipeline_stage", pipelineId: "", stage: "" };
}

function emptyDelay(): StepForm {
  return { kind: "delay", days: 0, hours: 1, minutes: 0 };
}

function defaultBranch(): BranchForm {
  return {
    label: "Qualified path",
    isElse: false,
    filters: [],
    steps: [{ kind: "action", action: emptyAction() }],
  };
}

function stepFromApi(s: unknown): StepForm {
  if (s && typeof s === "object" && (s as { type?: string }).type === "delay") {
    const d = s as { days?: number; hours?: number; minutes?: number };
    return { kind: "delay", days: d.days ?? 0, hours: d.hours ?? 0, minutes: d.minutes ?? 0 };
  }
  if (s && typeof s === "object" && (s as { type?: string }).type === "action") {
    return { kind: "action", action: (s as { action: Record<string, unknown> }).action || emptyAction() };
  }
  return { kind: "action", action: emptyAction() };
}

function workflowToBranches(w: WorkflowRow): BranchForm[] {
  if (w.branches && w.branches.length > 0) {
    return w.branches.map((b) => ({
      label: b.label || "Branch",
      isElse: !!b.isElse,
      filters: normalizeWorkflowFilters(b.filters),
      steps: (b.steps || []).map(stepFromApi),
    }));
  }
  const legacy = (w.actions || []).map((a) => ({ kind: "action" as const, action: a }));
  return [
    {
      label: "Main path",
      isElse: false,
      filters: [],
      steps: legacy.length ? legacy : [{ kind: "action" as const, action: emptyAction() }],
    },
  ];
}

type FormState = {
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  triggers: string[];
  triggerCombine: "any" | "all";
  filters: WorkflowFilterValue[];
  branches: BranchForm[];
  enrollmentPolicy: "once" | "every_time";
  editorMode: "branches" | "canvas";
  canvasGraph: WorkflowCanvasApiGraph | null;
  goal: { enabled: boolean; label: string; filters: WorkflowFilterValue[] };
};

function CustomSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
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
        className="w-full flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-4 py-2.5 text-sm font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all cursor-pointer hover:border-primary/30 hover:bg-primary/5"
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <svg className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <ul className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-card shadow-lg py-1">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors ${
                  opt.value === value
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-text-main hover:bg-primary/5 hover:text-primary"
                }`}
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

export function WorkflowEditorContent({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const isNew = workflowId === "new";
  const [wfLoading, setWfLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<WorkflowRow | null>(null);
  const [analytics, setAnalytics] = useState<{
    executionsByVariant: { A?: number; B?: number; unknown?: number };
    goalHits: number;
    successfulRuns: number;
  } | null>(null);
  const [pipelines, setPipelines] = useState<WorkflowCanvasPipelineOption[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<{ _id: string; name: string }[]>([]);
  const [inboxAccounts, setInboxAccounts] = useState<{ _id: string; email: string; displayName?: string }[]>([]);
  const [customFields, setCustomFields] = useState<WorkflowCustomFieldDef[]>([]);
  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    enabled: true,
    trigger: "lead_created",
    triggers: [],
    triggerCombine: "any",
    filters: [],
    branches: [defaultBranch()],
    enrollmentPolicy: "every_time",
    editorMode: "branches",
    canvasGraph: emptyGraph(),
    goal: { enabled: false, label: "Conversion", filters: [] },
  });
  const [dirty, setDirty] = useState(false);
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    if (wfLoading) return;
    // Snapshot after load completes; `form` is intentionally omitted from deps to avoid resetting baseline on every edit.
    baselineRef.current = JSON.stringify(form);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline only when load finishes for this workflow
  }, [wfLoading, workflowId]);

  useEffect(() => {
    if (wfLoading || baselineRef.current === null) return;
    setDirty(JSON.stringify(form) !== baselineRef.current);
  }, [form, wfLoading]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const confirmLeave = () => {
    if (!dirty) return true;
    return window.confirm("You have unsaved changes. Leave without saving?");
  };

  const leaveToWorkflows = () => {
    if (!confirmLeave()) return;
    router.push("/crm/settings/workflows");
  };

  useEffect(() => {
    const t = localStorage.getItem("token");
    void (async () => {
      try {
        const [rL, rT, rInbox] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, { headers: { Authorization: `Bearer ${t}` } }),
          fetch(`${CRM_API_URL}/email-templates`, { headers: { Authorization: `Bearer ${t}` } }),
          fetch(`${CRM_API_URL}/crm/inbox-accounts`, { headers: { Authorization: `Bearer ${t}` } }),
        ]);
        const leads = rL.ok ? await rL.json() : [];
        const merged: WorkflowCanvasPipelineOption[] = [
          ...(Array.isArray(leads) ? leads : []),
        ].map((p: { _id?: string; name?: string; type?: string; stages?: { name: string }[] }) => ({
          _id: String(p._id ?? ""),
          name: String(p.name ?? ""),
          type: p.type,
          stages: p.stages,
        }));
        setPipelines(merged.filter((p) => p._id));
        const tpls = rT.ok ? await rT.json() : [];
        setEmailTemplates(
          Array.isArray(tpls)
            ? tpls.map((x: { _id?: string; name?: string }) => ({ _id: String(x._id ?? ""), name: String(x.name ?? "") })).filter((x) => x._id)
            : [],
        );
        const inboxJson = rInbox.ok ? await rInbox.json() : [];
        setInboxAccounts(
          Array.isArray(inboxJson)
            ? inboxJson
              .map((x: { _id?: string; email?: string; displayName?: string }) => ({
                _id: String(x._id ?? ""),
                email: String(x.email ?? ""),
                displayName: x.displayName ? String(x.displayName) : undefined,
              }))
              .filter((x) => x._id && x.email)
            : [],
        );
      } catch {
        setPipelines([]);
        setEmailTemplates([]);
        setInboxAccounts([]);
      }
    })();
  }, []);

  useEffect(() => {
    const mod = entityKindToCustomFieldModule(triggerEntityKind(form.trigger));
    if (!mod) {
      setCustomFields([]);
      return;
    }
    const t = localStorage.getItem("token");
    void fetch(`${CRM_API_URL}/custom-fields?module=${mod}`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (!Array.isArray(rows)) {
          setCustomFields([]);
          return;
        }
        setCustomFields(
          rows
            .map((x: { key?: string; name?: string; type?: string; options?: string[] }) => ({
              key: String(x.key ?? ""),
              name: String(x.name ?? x.key ?? ""),
              type: String(x.type ?? "text"),
              options: Array.isArray(x.options) ? x.options.map(String) : undefined,
            }))
            .filter((x) => x.key),
        );
      })
      .catch(() => setCustomFields([]));
  }, [form.trigger]);

  useEffect(() => {
    if (isNew) {
      setEditing(null);
      setAnalytics(null);
      let prefill: WorkflowCreatePrefill = {};
      try {
        const raw =
          typeof window !== "undefined"
            ? sessionStorage.getItem(WORKFLOW_CREATE_PREFILL_KEY)
            : null;
        if (raw) {
          sessionStorage.removeItem(WORKFLOW_CREATE_PREFILL_KEY);
          prefill = JSON.parse(raw) as WorkflowCreatePrefill;
        }
      } catch {
        /* ignore invalid prefill */
      }
      const triggerOk =
        prefill.trigger && TRIGGERS.some((t) => t.value === prefill.trigger)
          ? prefill.trigger
          : "lead_created";
      setForm({
        name: typeof prefill.name === "string" ? prefill.name.trim() : "",
        description: typeof prefill.description === "string" ? prefill.description : "",
        enabled: typeof prefill.enabled === "boolean" ? prefill.enabled : true,
        trigger: triggerOk,
        triggers: [],
        triggerCombine: "any",
        filters: [],
        branches: [defaultBranch()],
        enrollmentPolicy:
          prefill.enrollmentPolicy === "once" || prefill.enrollmentPolicy === "every_time"
            ? prefill.enrollmentPolicy
            : "every_time",
        editorMode:
          prefill.editorMode === "canvas" || prefill.editorMode === "branches"
            ? prefill.editorMode
            : "branches",
        canvasGraph: emptyGraph(),
        goal: { enabled: false, label: "Conversion", filters: [] },
      });
      setWfLoading(false);
      return;
    }
    const t = localStorage.getItem("token");
    void (async () => {
      setWfLoading(true);
      try {
        const res = await fetch(`${CRM_API_URL}/crm/workflows/${workflowId}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.status === 401) {
          router.push("/auth/login?error=unauthorized");
          return;
        }
        if (!res.ok) {
          toast.error("Workflow not found");
          router.replace("/crm/settings/workflows");
          return;
        }
        const w: WorkflowRow = await res.json();
        setEditing(w);
        const once =
          w.enrollmentPolicy === "once" || (w.enrollmentPolicy !== "every_time" && !!w.onlyOncePerRecord);
        const g = w.goal;
        setForm({
          name: w.name,
          description: w.description || "",
          enabled: w.enabled,
          trigger: w.trigger,
          triggers: Array.isArray(w.triggers) ? w.triggers.filter(Boolean) : [],
          triggerCombine: w.triggerCombine === "all" ? "all" : "any",
          filters: normalizeWorkflowFilters(w.filters),
          branches: workflowToBranches(w),
          enrollmentPolicy: once ? "once" : "every_time",
          editorMode: w.editorMode === "canvas" ? "canvas" : "branches",
          canvasGraph: w.canvasGraph?.nodes?.length ? w.canvasGraph : emptyGraph(),
          goal: {
            enabled: !!g?.enabled,
            label: g?.label || "Conversion",
            filters: normalizeWorkflowFilters(g?.filters),
          },
        });
        const aRes = await fetch(`${CRM_API_URL}/crm/workflows/${w._id}/analytics`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        setAnalytics(aRes.ok ? await aRes.json() : null);
      } catch {
        toast.error("Failed to load workflow");
        router.replace("/crm/settings/workflows");
      } finally {
        setWfLoading(false);
      }
    })();
  }, [workflowId, isNew, router]);

  const saveWorkflow = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const branchActions = form.branches.flatMap((b) =>
      b.steps.filter((s) => s.kind === "action").map((s) => s.action),
    );
    const canvasActions =
      form.editorMode === "canvas" && form.canvasGraph?.nodes?.length
        ? form.canvasGraph.nodes
            .filter((n) => n.type === "wf_action" && n.action)
            .map((n) => n.action as Record<string, unknown>)
        : [];
    const actionIssues = collectWorkflowActionIssues([
      ...branchActions,
      ...canvasActions,
    ]);
    if (actionIssues.length) {
      toast.error(actionIssues[0]);
      return;
    }

    setSaving(true);
    const t = localStorage.getItem("token");
    const persistFilters = (rows: WorkflowFilterValue[]) =>
      rows.filter(isPersistableWorkflowFilter).map(normalizeWorkflowFilter);

    const branchesPayload = form.branches.map((b) => ({
      label: b.label.trim() || "Branch",
      isElse: b.isElse,
      filters: persistFilters(b.filters),
      steps: b.steps.map((s) => {
        if (s.kind === "delay") {
          return { type: "delay", days: s.days, hours: s.hours, minutes: s.minutes };
        }
        return { type: "action", action: normalizeAction(s.action) };
      }),
    }));

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      trigger: form.trigger,
      triggers: form.triggers.filter((t) => t && t !== form.trigger),
      triggerCombine:
        form.triggers.filter((t) => t && t !== form.trigger).length > 0
          ? form.triggerCombine
          : "any",
      filters: persistFilters(form.filters),
      branches: form.editorMode === "branches" ? branchesPayload : [],
      actions: [],
      enrollmentPolicy: form.enrollmentPolicy,
      onlyOncePerRecord: form.enrollmentPolicy === "once",
      editorMode: form.editorMode,
      canvasGraph:
        form.editorMode === "canvas" && form.canvasGraph?.nodes?.length
          ? normalizeCanvasGraph(form.canvasGraph) ?? form.canvasGraph
          : form.editorMode === "canvas"
            ? form.canvasGraph
            : undefined,
      goal: form.goal.enabled
        ? {
          enabled: true,
          label: form.goal.label.trim() || "Goal",
          filters: persistFilters(form.goal.filters),
        }
        : { enabled: false, filters: [] },
    };
    try {
      const url = editing
        ? `${CRM_API_URL}/crm/workflows/${editing._id}`
        : `${CRM_API_URL}/crm/workflows`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Save failed");
      }
      const data = (await res.json().catch(() => null)) as { _id?: string } | null;
      toast.success(editing ? "Workflow saved" : "Workflow created");
      if (!editing && data?._id) {
        router.push(`/crm/settings/workflows/${data._id}`);
      } else if (editing) {
        baselineRef.current = JSON.stringify(form);
        setDirty(false);
        router.refresh();
      } else {
        router.push("/crm/settings/workflows");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-4 py-2.5 text-sm font-medium text-text-main outline-none placeholder:text-text-muted/60 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all";
  const selectClass =
    "w-full appearance-none rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-4 py-2.5 pr-9 text-sm font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all cursor-pointer";
  const labelClass = "block text-xs font-black text-text-muted  px-0.5";

  if (wfLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-text-muted">
        <Loader2 className="animate-spin" size={40} />
        <p className="text-sm font-medium">Loading workflow…</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 space-y-5">
      {/* Page header — not sticky, sits inline with the settings layout */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4 flex-wrap gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/crm/settings/workflows"
            onClick={(e) => { if (dirty) { e.preventDefault(); leaveToWorkflows(); } }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-surface-dim hover:text-text-main"
          >
            <ChevronLeft size={14} /> Back
          </Link>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary ring-1 ring-primary/15">
            <GitBranch size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-bold tracking-tight text-text-main">
                {editing ? form.name.trim() || "Edit workflow" : "New workflow"}
              </h1>
              {dirty && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/25">
                  Unsaved
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              {isNew ? "Set up trigger, entry rules, then branches or canvas — save to activate." : "Entry criteria, branches or visual canvas, delays, and actions."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={leaveToWorkflows}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:bg-surface-dim hover:text-text-main"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveWorkflow}
            disabled={saving || !form.name.trim()}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-colors hover:bg-primary-dark disabled:pointer-events-none disabled:opacity-40"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            {editing ? "Save changes" : "Save"}
          </button>
        </div>
      </div>

      {isNew && (
        <div className="rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-text-muted">Getting started</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-text-main">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1 ring-1 ring-primary/20">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">1</span>
              Details &amp; trigger
            </span>
            <span className="text-text-muted">→</span>
            <span className="text-text-muted">Entry criteria</span>
            <span className="text-text-muted">→</span>
            <span className="text-text-muted">Branch or canvas builder</span>
            <span className="text-text-muted">→</span>
            <span className="text-text-muted">Save</span>
          </div>
        </div>
      )}

      <div className="space-y-4">
          <section className="rounded-[var(--radius-md)] border border-border bg-card p-5 space-y-4 shadow-sm ring-1 ring-border/40">
            <h3 className="flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold text-text-main">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary ring-1 ring-primary/15">
                <Sparkles size={18} />
              </span>
              Workflow details
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className={labelClass}>Name</label>
                <input
                  className={fieldClass}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Hot lead — task + delay + email"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className={labelClass}>Description</label>
                <textarea
                  className={`min-h-[72px] resize-y ${fieldClass}`}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-1 space-y-1">
                <label className={labelClass}>Trigger</label>
                <CustomSelect
                  value={form.trigger}
                  onChange={(v) => setForm((f) => ({ ...f, trigger: v, triggers: [], triggerCombine: "any" }))}
                  options={TRIGGERS}
                />
              </div>
              <div className="sm:col-span-1 space-y-1">
                <label className={labelClass}>Additional triggers</label>
                <div className="max-h-[132px] overflow-y-auto rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 p-1.5">
                  {triggerFamily(`${form.trigger.split("_")[0]}_`).map((t) => (
                    <label key={t.value} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-text-main cursor-pointer hover:bg-primary/8 transition-colors">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                        checked={form.triggers.includes(t.value)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            triggers: e.target.checked
                              ? [...new Set([...f.triggers, t.value])]
                              : f.triggers.filter((x) => x !== t.value),
                          }))
                        }
                      />
                      <span>{t.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-text-muted px-0.5">
                  {form.triggers.filter((x) => x !== form.trigger).length > 0
                    ? form.triggerCombine === "all"
                      ? "Runs only after every selected trigger has fired at least once (order does not matter)."
                      : "Runs if any selected trigger fires."
                    : "Pick additional triggers to combine with the primary trigger, or leave only the primary."}
                </p>
                {form.triggers.filter((x) => x !== form.trigger).length > 0 ? (
                  <div className="mt-1.5 space-y-1.5 rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 p-3">
                    <p className={labelClass}>Combine triggers</p>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-text-main hover:text-primary transition-colors">
                      <input
                        type="radio"
                        name="triggerCombine"
                        className="mt-0.5 accent-primary cursor-pointer"
                        checked={form.triggerCombine === "any"}
                        onChange={() => setForm((f) => ({ ...f, triggerCombine: "any" }))}
                      />
                      <span><span className="font-semibold">Any (OR)</span> — run when any of the selected triggers fire</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-text-main hover:text-primary transition-colors">
                      <input
                        type="radio"
                        name="triggerCombine"
                        className="mt-0.5 accent-primary cursor-pointer"
                        checked={form.triggerCombine === "all"}
                        onChange={() => setForm((f) => ({ ...f, triggerCombine: "all" }))}
                      />
                      <span><span className="font-semibold">All (AND)</span> — run only after each selected trigger has fired at least once for this record</span>
                    </label>
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-4 py-3 cursor-pointer hover:bg-primary/5 transition-colors sm:col-span-1 sm:mt-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded accent-primary cursor-pointer"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                <div>
                  <span className="text-sm font-semibold text-text-main">Workflow enabled</span>
                  <p className="mt-0.5 text-xs text-text-muted">When off, nothing runs until you turn it on.</p>
                </div>
              </label>
              <div className="col-span-2 rounded-[var(--radius-md)] border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className={`${labelClass} text-primary`}>Enrollment</p>
                <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-text-main hover:text-primary transition-colors">
                    <input
                      type="radio"
                      name="enroll"
                      className="mt-0.5 accent-primary cursor-pointer"
                      checked={form.enrollmentPolicy === "every_time"}
                      onChange={() => setForm((f) => ({ ...f, enrollmentPolicy: "every_time" }))}
                    />
                    <span>Every time the trigger fires (when entry criteria pass)</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-text-main hover:text-primary transition-colors">
                    <input
                      type="radio"
                      name="enroll"
                      className="mt-0.5 accent-primary cursor-pointer"
                      checked={form.enrollmentPolicy === "once"}
                      onChange={() => setForm((f) => ({ ...f, enrollmentPolicy: "once" }))}
                    />
                    <span>Only once per record</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-5 sm:p-6 space-y-3 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Filter size={16} />
              </span>
              Entry criteria
              <span className="text-xs font-normal text-slate-500">(all must match)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Optional global rules before any branch runs. Leave empty to run on every matching trigger.
              Combine <strong className="font-medium text-slate-600">property</strong>,{" "}
              <strong className="font-medium text-slate-600">segment</strong>, and{" "}
              <strong className="font-medium text-slate-600">email engagement</strong> rules (all must pass).
            </p>
            <WorkflowFilterList
              filters={form.filters}
              onChange={(filters) => setForm((f) => ({ ...f, filters }))}
              entityKind={triggerEntityKind(form.trigger)}
              pipelines={pipelines}
              variant="form"
              showEventFilters
            />
          </section>

          <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/30 p-5 sm:p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-100 text-slate-700">
                <LayoutGrid size={16} />
              </span>
              Builder
            </h3>
            <p className="text-xs text-slate-500">Choose how you want to design paths and steps.</p>
            <div className="inline-flex p-1 rounded-[var(--radius-md)] bg-white border border-[var(--border-color)]/80 shadow-sm w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, editorMode: "branches" }))}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${form.editorMode === "branches"
                    ? "bg-slate-900 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                <ListTree size={16} /> Branch editor
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, editorMode: "canvas" }))}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${form.editorMode === "canvas"
                    ? "bg-violet-600 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                <LayoutGrid size={16} /> Visual canvas
              </button>
            </div>
            {editing && analytics && (
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-2 rounded-[var(--radius-md)] border border-[var(--border-color)]/60 bg-white/80 px-4 py-3">
                <span>
                  Successful runs: <strong className="text-slate-900">{analytics.successfulRuns}</strong>
                </span>
                <span>
                  A/B: A <strong className="text-slate-900">{analytics.executionsByVariant.A ?? 0}</strong> · B{" "}
                  <strong className="text-slate-900">{analytics.executionsByVariant.B ?? 0}</strong>
                </span>
                <span>
                  Goal hits: <strong className="text-slate-900">{analytics.goalHits}</strong>
                </span>
              </div>
            )}
          </section>

          <section className="rounded-[var(--radius-md)] border border-emerald-100/80 bg-gradient-to-br from-emerald-50/50 to-white p-5 sm:p-6 space-y-3 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900 cursor-pointer">
              <input
                type="checkbox"
                checked={form.goal.enabled}
                onChange={(e) => setForm((f) => ({ ...f, goal: { ...f.goal, enabled: e.target.checked } }))}
              />
              Conversion goal (reporting — when these filters match the record)
            </label>
            {form.goal.enabled && (
              <div className="space-y-2 pt-1">
                <input
                  className={`${fieldClass} border-emerald-200/80 focus:ring-emerald-500/20 focus:border-emerald-400/50`}
                  placeholder="Goal label"
                  value={form.goal.label}
                  onChange={(e) => setForm((f) => ({ ...f, goal: { ...f.goal, label: e.target.value } }))}
                />
                <WorkflowFilterList
                  filters={form.goal.filters}
                  onChange={(filters) =>
                    setForm((f) => ({ ...f, goal: { ...f.goal, filters } }))
                  }
                  entityKind={triggerEntityKind(form.trigger)}
                  pipelines={pipelines}
                  variant="goal"
                  showEventFilters
                />
              </div>
            )}
          </section>

          {form.editorMode === "canvas" && form.canvasGraph && (
            <section className="rounded-[var(--radius-md)] border border-violet-100 bg-violet-50/20 p-5 sm:p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-violet-100 text-violet-700">
                  <LayoutGrid size={16} />
                </span>
                Canvas
              </h3>
              <p className="text-xs text-slate-500">Drag nodes from the toolbar and connect edges from Start.</p>
              <div className="rounded-[var(--radius-md)] border border-violet-200/60 bg-white/90 p-3 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Start from a template</label>
                <select
                  className="w-full max-w-xl rounded-[var(--radius-md)] border border-[var(--border-color)] px-3 py-2 text-sm bg-white"
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const tpl = WORKFLOW_CANVAS_TEMPLATES.find((x) => x.id === id);
                    e.target.value = "";
                    if (!tpl) return;
                    setForm((f) => ({
                      ...f,
                      canvasGraph: tpl.graph,
                      trigger: tpl.trigger,
                      description: f.description?.trim() ? f.description : tpl.description,
                    }));
                    toast.message(`Loaded “${tpl.name}” — pick email templates on each Send email step.`);
                  }}
                >
                  <option value="">Choose template…</option>
                  {WORKFLOW_CANVAS_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 leading-snug">
                  Templates include send jitter and optional “Wait · email open” branching. Use{" "}
                  <strong className="font-semibold text-slate-700">Split across mailboxes</strong> on Send email (2+ accounts) to
                  spread volume across connected inboxes.
                </p>
              </div>
              <WorkflowCanvasEditor
                key={editing?._id ?? "new"}
                layout="page"
                value={form.canvasGraph}
                onChange={(g) => setForm((f) => ({ ...f, canvasGraph: g }))}
                entityKind={triggerEntityKind(form.trigger)}
                pipelines={pipelines}
                emailTemplates={emailTemplates}
                inboxAccounts={inboxAccounts}
                customFields={customFields}
              />
            </section>
          )}

          {form.editorMode === "branches" && (
            <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
                      <Split size={16} />
                    </span>
                    Branches (IF / ELSE)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-xl">
                    First branch whose branch filters pass runs. Use <strong>Otherwise</strong> for the catch-all path (keep it last).
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary-dark shrink-0"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      branches: [
                        ...f.branches,
                        { label: `Branch ${f.branches.length + 1}`, isElse: false, filters: [], steps: [{ kind: "action", action: emptyAction() }] },
                      ],
                    }))
                  }
                >
                  <Plus size={16} /> Add branch
                </button>
              </div>
              <div className="space-y-5">
                {form.branches.map((br, bi) => (
                  <div key={bi} className="rounded-[var(--radius-md)] border border-[var(--border-color)]/80 p-5 space-y-4 bg-gradient-to-b from-slate-50/40 to-white shadow-sm">
                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        className="font-bold border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 py-1.5 flex-1 min-w-[160px] bg-white"
                        value={br.label}
                        onChange={(e) => {
                          const next = [...form.branches];
                          next[bi] = { ...br, label: e.target.value };
                          setForm((f) => ({ ...f, branches: next }));
                        }}
                      />
                      <label className="flex items-center gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          checked={br.isElse}
                          onChange={(e) => {
                            const next = [...form.branches];
                            next[bi] = { ...br, isElse: e.target.checked };
                            setForm((f) => ({ ...f, branches: next }));
                          }}
                        />
                        Otherwise (else)
                      </label>
                      <button
                        type="button"
                        className="text-rose-600 text-sm ml-auto"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            branches: f.branches.filter((_, j) => j !== bi),
                          }))
                        }
                      >
                        Remove branch
                      </button>
                    </div>
                    {!br.isElse && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase text-slate-400">
                          When (branch conditions — leave empty to always run this path)
                        </p>
                        <WorkflowFilterList
                          filters={br.filters}
                          onChange={(filters) => {
                            const nextBranches = [...form.branches];
                            nextBranches[bi] = { ...br, filters };
                            setForm((f) => ({ ...f, branches: nextBranches }));
                          }}
                          entityKind={triggerEntityKind(form.trigger)}
                          pipelines={pipelines}
                          variant="form"
                          showEventFilters
                        />
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold uppercase text-slate-400 mb-2 flex items-center gap-1">
                        <PlayCircle size={12} /> Then — steps (actions & delays)
                      </p>
                      <div className="space-y-2">
                        {br.steps.map((step, si) => (
                          <div key={si} className="border border-white shadow-sm rounded-[var(--radius-md)] p-3 bg-white">
                            {step.kind === "delay" ? (
                              <div className="flex flex-wrap gap-2 items-end">
                                <span className="text-xs font-bold text-amber-700">Delay</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 border rounded-lg px-2 py-1 text-sm border-[var(--border-color)] bg-white"
                                  value={step.days}
                                  onChange={(e) => {
                                    const next = [...form.branches];
                                    const ns = [...br.steps];
                                    ns[si] = { ...step, days: Number(e.target.value) };
                                    next[bi] = { ...br, steps: ns };
                                    setForm((f) => ({ ...f, branches: next }));
                                  }}
                                />
                                <span className="text-xs">d</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 border rounded-lg px-2 py-1 text-sm border-[var(--border-color)] bg-white"
                                  value={step.hours}
                                  onChange={(e) => {
                                    const next = [...form.branches];
                                    const ns = [...br.steps];
                                    ns[si] = { ...step, hours: Number(e.target.value) };
                                    next[bi] = { ...br, steps: ns };
                                    setForm((f) => ({ ...f, branches: next }));
                                  }}
                                />
                                <span className="text-xs">h</span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 border rounded-lg px-2 py-1 text-sm border-[var(--border-color)] bg-white"
                                  value={step.minutes}
                                  onChange={(e) => {
                                    const next = [...form.branches];
                                    const ns = [...br.steps];
                                    ns[si] = { ...step, minutes: Number(e.target.value) };
                                    next[bi] = { ...br, steps: ns };
                                    setForm((f) => ({ ...f, branches: next }));
                                  }}
                                />
                                <span className="text-xs">m</span>
                                <button
                                  type="button"
                                  className="text-rose-600 text-xs ml-auto"
                                  onClick={() => {
                                    const next = [...form.branches];
                                    next[bi] = { ...br, steps: br.steps.filter((_, j) => j !== si) };
                                    setForm((f) => ({ ...f, branches: next }));
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : (
                              <div>
                                <div className="flex gap-2 mb-2">
                                  <select
                                    className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1 text-sm font-medium flex-1 bg-white"
                                    value={String(step.action.type || "create_task")}
                                    onChange={(e) => {
                                      const next = [...form.branches];
                                      const ns = [...br.steps];
                                      ns[si] = { kind: "action", action: defaultActionForType(e.target.value) };
                                      next[bi] = { ...br, steps: ns };
                                      setForm((f) => ({ ...f, branches: next }));
                                    }}
                                  >
                                    {ACTION_TYPES.map((a) => (
                                      <option key={a.value} value={a.value}>
                                        {a.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="text-rose-600 text-xs"
                                    onClick={() => {
                                      const next = [...form.branches];
                                      next[bi] = { ...br, steps: br.steps.filter((_, j) => j !== si) };
                                      setForm((f) => ({ ...f, branches: next }));
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                                <ActionFields
                                  row={step.action}
                                  emailTemplates={emailTemplates}
                                  inboxAccounts={inboxAccounts}
                                  entityKind={triggerEntityKind(form.trigger)}
                                  pipelines={pipelines}
                                  customFields={customFields}
                                  onChange={(patch) => {
                                    const next = [...form.branches];
                                    const ns = [...br.steps];
                                    const cur = ns[si] as { kind: "action"; action: Record<string, unknown> };
                                    ns[si] = { kind: "action", action: { ...cur.action, ...patch } };
                                    next[bi] = { ...br, steps: ns };
                                    setForm((f) => ({ ...f, branches: next }));
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="text-xs font-semibold text-primary"
                            onClick={() => {
                              const next = [...form.branches];
                              next[bi] = { ...br, steps: [...br.steps, { kind: "action", action: emptyAction() }] };
                              setForm((f) => ({ ...f, branches: next }));
                            }}
                          >
                            + Action
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-amber-700"
                            onClick={() => {
                              const next = [...form.branches];
                              next[bi] = { ...br, steps: [...br.steps, emptyDelay()] };
                              setForm((f) => ({ ...f, branches: next }));
                            }}
                          >
                            + Delay
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

    </div>
  );
}

function defaultActionForType(t: string): Record<string, unknown> {
  switch (t) {
    case "move_pipeline_stage":
      return { type: "move_pipeline_stage", pipelineId: "", stage: "" };
    case "set_property":
      return { type: "set_property", field: "stage", value: "" };
    case "add_to_segment":
      return { type: "add_to_segment", segmentId: "" };
    case "remove_from_segment":
      return { type: "remove_from_segment", segmentId: "" };
    case "assign_owner":
      return { type: "assign_owner", ownerName: "" };
    case "create_task":
      return {
        type: "create_task",
        title: "Follow up",
        body: "",
        dueInDays: 1,
        calendarEnabled: true,
        reminderEnabled: true,
        reminderBeforeMinutes: 0,
      };
    case "create_note":
      return { type: "create_note", body: "" };
    case "notify_teams":
      return { type: "notify_teams", message: "", email: "" };
    case "http_webhook":
      return { type: "http_webhook", url: "", method: "POST" };
    case "send_email_template":
      return {
        type: "send_email_template",
        sendMode: "template",
        templateId: "",
        inboxAccountId: "",
      };
    default:
      return {
        type: "create_task",
        title: "Follow up",
        body: "",
        dueInDays: 1,
        calendarEnabled: true,
        reminderEnabled: true,
        reminderBeforeMinutes: 0,
      };
  }
}

function normalizeAction(a: Record<string, unknown>): Record<string, unknown> {
  const t = String(a.type || "create_task");
  if (t === "move_pipeline_stage") {
    return {
      type: "move_pipeline_stage",
      pipelineId: String(a.pipelineId || ""),
      stage: String(a.stage || ""),
    };
  }
  if (t === "set_property") {
    return { type: "set_property", field: String(a.field || ""), value: coerceValue(a.value) };
  }
  if (t === "add_to_segment" || t === "remove_from_segment") {
    return { type: t, segmentId: String(a.segmentId || "") };
  }
  if (t === "assign_owner") {
    return { type: "assign_owner", ownerName: String(a.ownerName || "") };
  }
  if (t === "create_task") {
    return {
      type: "create_task",
      title: String(a.title || "Task"),
      body: a.body ? String(a.body) : undefined,
      dueInDays: a.dueInDays != null ? Number(a.dueInDays) : undefined,
      calendarEnabled: a.calendarEnabled !== false,
      reminderEnabled: a.reminderEnabled !== false,
      reminderBeforeMinutes:
        a.reminderBeforeMinutes != null ? Number(a.reminderBeforeMinutes) : 0,
    };
  }
  if (t === "create_note") {
    return { type: "create_note", body: String(a.body || "") };
  }
  if (t === "notify_teams") {
    return {
      type: "notify_teams",
      message: String(a.message || ""),
      email: String(a.email || ""),
      link: a.link ? String(a.link) : undefined,
    };
  }
  if (t === "http_webhook") {
    return {
      type: "http_webhook",
      url: String(a.url || ""),
      method: (a.method === "GET" ? "GET" : "POST") as "GET" | "POST",
      headers: a.headers && typeof a.headers === "object" ? (a.headers as Record<string, string>) : undefined,
    };
  }
  if (t === "send_email_template") {
    const sendMode = a.sendMode === "ai_draft" ? "ai_draft" : "template";
    const rawSplit = a.mailboxSplit as { mode?: string; accountIds?: unknown[] } | undefined;
    const ids = Array.isArray(rawSplit?.accountIds)
      ? rawSplit.accountIds!.map(String).filter((id) => /^[a-fA-F0-9]{24}$/.test(id))
      : [];
    const mode =
      rawSplit?.mode === "round_robin" || rawSplit?.mode === "random" || rawSplit?.mode === "sticky_entity"
        ? rawSplit.mode
        : undefined;
    const jitterRaw = Number(a.sendJitterSecondsMax);
    const jitter =
      !Number.isNaN(jitterRaw) && jitterRaw > 0 ? Math.min(3600, Math.floor(jitterRaw)) : undefined;
    const base: Record<string, unknown> = {
      type: "send_email_template",
      sendMode,
      templateId: sendMode === "template" ? String(a.templateId || "") : undefined,
      aiInstructions:
        sendMode === "ai_draft" && a.aiInstructions
          ? String(a.aiInstructions)
          : undefined,
      enforceRecipientMatch: a.enforceRecipientMatch !== false,
    };
    if (jitter != null) base.sendJitterSecondsMax = jitter;
    if (ids.length >= 2 && mode) {
      return { ...base, mailboxSplit: { mode, accountIds: ids } };
    }
    return {
      ...base,
      inboxAccountId: a.inboxAccountId ? String(a.inboxAccountId) : undefined,
    };
  }
  return defaultActionForType("create_task");
}

/** Persist explicit yes/no on wait-open edges when possible (matches workflow runtime). */
function inferWaitEmailEngagementBranches(g: WorkflowCanvasApiGraph): WorkflowCanvasApiGraph {
  const waitIds = new Set(
    g.nodes.filter((n) => n.type === "wf_wait_email_engagement").map((n) => n.id),
  );
  const edges = g.edges.map((e) => ({ ...e }));
  for (const wid of waitIds) {
    const idxs = edges.map((e, i) => (e.source === wid ? i : -1)).filter((i) => i >= 0);
    if (idxs.length !== 2) continue;
    const out = idxs.map((i) => edges[i]);
    const branches = out.map((e) => e.branch || "default");
    const hasY = branches.includes("yes");
    const hasN = branches.includes("no");
    if (hasY && hasN) continue;
    if (branches.every((b) => b === "default")) {
      const sorted = [...idxs].sort((ia, ib) => edges[ia].id.localeCompare(edges[ib].id));
      edges[sorted[0]].branch = "yes";
      edges[sorted[1]].branch = "no";
      continue;
    }
    if (hasY && !hasN && branches.filter((b) => b === "default").length === 1) {
      const i = idxs.find((ix) => (edges[ix].branch || "default") === "default");
      if (i !== undefined) edges[i].branch = "no";
      continue;
    }
    if (hasN && !hasY && branches.filter((b) => b === "default").length === 1) {
      const i = idxs.find((ix) => (edges[ix].branch || "default") === "default");
      if (i !== undefined) edges[i].branch = "yes";
    }
  }
  return { ...g, edges };
}

function normalizeCanvasGraph(g: WorkflowCanvasApiGraph | null): WorkflowCanvasApiGraph | null {
  if (!g?.nodes?.length) return g;
  const withBranches = inferWaitEmailEngagementBranches(g);
  return {
    ...withBranches,
    nodes: withBranches.nodes.map((n) => {
      if (n.type === "wf_action" && n.action && typeof n.action === "object") {
        return { ...n, action: normalizeAction(n.action as Record<string, unknown>) };
      }
      if (n.type === "wf_condition" && Array.isArray(n.filters)) {
        return {
          ...n,
          filters: n.filters.map((f) => normalizeWorkflowFilter(f)),
        };
      }
      return n;
    }),
  };
}

function coerceValue(v: unknown): string | number | boolean {
  if (v === "true") return true;
  if (v === "false") return false;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v;
  const s = String(v ?? "");
  if (s !== "" && !isNaN(Number(s)) && s.trim() !== "") return Number(s);
  return s;
}

function ActionFields({
  row,
  onChange,
  emailTemplates,
  inboxAccounts,
  entityKind,
  pipelines,
  customFields,
}: {
  row: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  emailTemplates: { _id: string; name: string }[];
  inboxAccounts: { _id: string; email: string; displayName?: string }[];
  entityKind: WorkflowCanvasEntityKind;
  pipelines: WorkflowCanvasPipelineOption[];
  customFields: WorkflowCustomFieldDef[];
}) {
  const t = String(row.type || "");
  if (t === "move_pipeline_stage") {
    return (
      <WorkflowMovePipelineStageFields
        pipelineId={String(row.pipelineId ?? "")}
        stage={String(row.stage ?? "")}
        onChange={onChange}
        entityKind={entityKind}
        pipelines={pipelines}
        variant="form"
      />
    );
  }
  if (t === "set_property") {
    return (
      <WorkflowSetPropertyFields
        field={String(row.field ?? "")}
        value={row.value}
        onChange={onChange}
        entityKind={entityKind}
        pipelines={pipelines}
        customFields={customFields}
        variant="form"
      />
    );
  }
  if (t === "add_to_segment" || t === "remove_from_segment") {
    return (
      <WorkflowSegmentActionFields
        segmentId={String(row.segmentId ?? "")}
        onChange={onChange}
        entityKind={entityKind}
        variant="form"
      />
    );
  }
  if (t === "assign_owner") {
    return (
      <input
        className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full"
        placeholder="Owner display name (lead)"
        value={String(row.ownerName ?? "")}
        onChange={(e) => onChange({ ownerName: e.target.value })}
      />
    );
  }
  if (t === "create_task") {
    return (
      <div className="grid gap-2">
        <input
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm"
          placeholder="Title"
          value={String(row.title ?? "")}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <textarea
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm"
          placeholder="Description (optional)"
          value={String(row.body ?? "")}
          onChange={(e) => onChange({ body: e.target.value })}
        />
        <input
          type="number"
          min={0}
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-40"
          placeholder="Due in days"
          value={row.dueInDays === undefined ? "" : Number(row.dueInDays)}
          onChange={(e) => onChange({ dueInDays: e.target.value === "" ? undefined : Number(e.target.value) })}
        />
        <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-2.5 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={row.calendarEnabled !== false}
              onChange={(e) => onChange({ calendarEnabled: e.target.checked })}
            />
            Show on calendar
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={row.reminderEnabled !== false}
              onChange={(e) => onChange({ reminderEnabled: e.target.checked })}
            />
            Auto reminder
          </label>
          <label className="text-[11px] font-medium text-[var(--text-muted)] sm:col-span-2">
            Remind before task is due
            <select
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-1.5 text-sm"
              disabled={row.reminderEnabled === false}
              value={Number(row.reminderBeforeMinutes ?? 0)}
              onChange={(e) =>
                onChange({ reminderBeforeMinutes: Number(e.target.value) })
              }
            >
              <option value={0}>At due time</option>
              <option value={10}>10 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={1440}>1 day before</option>
            </select>
          </label>
        </div>
      </div>
    );
  }
  if (t === "create_note") {
    return (
      <textarea
        className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full min-h-[80px]"
        placeholder="Note body"
        value={String(row.body ?? "")}
        onChange={(e) => onChange({ body: e.target.value })}
      />
    );
  }
  if (t === "notify_teams") {
    return (
      <div className="grid gap-2">
        <p className="text-xs text-amber-900/90 rounded-[var(--radius-md)] border border-amber-200/80 bg-amber-50/80 px-3 py-2 leading-snug">
          Teams uses Microsoft Graph on the server. Set <span className="font-mono text-xs">TEAMS_CLIENT_ID</span>,{" "}
          <span className="font-mono text-xs">TEAMS_CLIENT_SECRET</span>, <span className="font-mono text-xs">TEAMS_TENANT_ID</span>, and{" "}
          <span className="font-mono text-xs">TEAMS_SENDER_ID</span> (Azure AD object ID of a user in your tenant — required for a 1:1 chat). App
          needs Graph permissions such as <span className="font-mono text-xs">Chat.Create</span>,{" "}
          <span className="font-mono text-xs">ChatMessage.Send</span>, <span className="font-mono text-xs">User.Read.All</span>.
        </p>
        <input
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm"
          placeholder="Recipient email (Microsoft 365 / Entra ID)"
          value={String(row.email ?? "")}
          onChange={(e) => onChange({ email: e.target.value })}
        />
        <textarea
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm min-h-[72px]"
          placeholder="Message (plain text)"
          value={String(row.message ?? "")}
          onChange={(e) => onChange({ message: e.target.value })}
        />
        <input
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm"
          placeholder="Optional link override (https://…)"
          value={String(row.link ?? "")}
          onChange={(e) => onChange({ link: e.target.value || undefined })}
        />
      </div>
    );
  }
  if (t === "http_webhook") {
    return (
      <div className="grid gap-2">
        <input
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm"
          placeholder="https://…"
          value={String(row.url ?? "")}
          onChange={(e) => onChange({ url: e.target.value })}
        />
        <select
          className="border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-40"
          value={String(row.method || "POST")}
          onChange={(e) => onChange({ method: e.target.value })}
        >
          <option value="POST">POST</option>
          <option value="GET">GET</option>
        </select>
      </div>
    );
  }
  if (t === "send_email_template") {
    return (
      <WorkflowSendEmailActionFields
        row={row}
        onChange={onChange}
        emailTemplates={emailTemplates}
        inboxAccounts={inboxAccounts}
        variant="form"
      />
    );
  }
  return null;
}
