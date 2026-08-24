"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  ChevronLeft,
  ChevronDown,
  Check,
  GitBranch,
  Zap,
  Timer,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Trash2,
  Copy,
  Search,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import {
  WORKFLOW_CREATE_PREFILL_KEY,
  type WorkflowCreatePrefill,
} from "@/lib/crm/workflow-create-prefill";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import LeadEngagementAutomationTemplates from "@/components/crm/automation/playbooks/LeadEngagementAutomationTemplates";

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";
const SEL =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all appearance-none";
const TXA =
  "w-full bg-white border border-[var(--border-color)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all resize-y";

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

const TRIGGER_GROUPS = [
  { heading: "Leads", prefix: "lead_" as const },
  { heading: "Contacts", prefix: "contact_" as const },
  { heading: "Organizations", prefix: "organization_" as const },
] as const;

type WorkflowRow = {
  _id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: string;
  enrollmentPolicy?: "once" | "every_time";
  onlyOncePerRecord?: boolean;
  editorMode?: "branches" | "canvas";
  updatedAt?: string;
};

type WorkflowApi = WorkflowRow & {
  triggers?: string[];
  triggerCombine?: "any" | "all";
  filters?: unknown[];
  branches?: { label?: string; isElse?: boolean; filters?: unknown[]; steps?: unknown[] }[];
  actions?: unknown[];
  canvasGraph?: unknown;
  goal?: { enabled?: boolean; label?: string; filters?: unknown[] };
};

function buildDuplicatePayload(w: WorkflowApi): Record<string, unknown> {
  const once =
    w.enrollmentPolicy === "once" || (w.enrollmentPolicy !== "every_time" && !!w.onlyOncePerRecord);
  const editorMode = w.editorMode === "canvas" ? "canvas" : "branches";
  const legacyActions = (w.actions || []) as Record<string, unknown>[];
  const branchesFromApi = w.branches;

  let branchesPayload: unknown[] = [];
  if (editorMode === "branches") {
    if (branchesFromApi && branchesFromApi.length > 0) {
      branchesPayload = branchesFromApi;
    } else if (legacyActions.length > 0) {
      branchesPayload = [
        { label: "Main path", isElse: false, filters: [], steps: legacyActions.map((a) => ({ type: "action", action: a })) },
      ];
    } else {
      branchesPayload = [{ label: "Main path", isElse: false, filters: [], steps: [] }];
    }
  }

  const g = w.goal;
  return {
    name: `${String(w.name).trim()} (copy)`,
    description: w.description?.trim() || undefined,
    enabled: false,
    trigger: w.trigger,
    triggers: Array.isArray(w.triggers) ? w.triggers.filter(Boolean) : [],
    triggerCombine: w.triggerCombine === "all" ? "all" : "any",
    filters: w.filters || [],
    branches: editorMode === "branches" ? branchesPayload : [],
    actions: [],
    enrollmentPolicy: once ? "once" : "every_time",
    onlyOncePerRecord: once,
    editorMode,
    canvasGraph: editorMode === "canvas" ? w.canvasGraph : undefined,
    goal: g?.enabled
      ? { enabled: true, label: g.label || "Goal", filters: g.filters || [] }
      : { enabled: false, filters: [] },
  };
}

function Dropdown({ value, onChange, options, widthClass = "min-w-[140px]" }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  widthClass?: string;
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
    <div ref={ref} className={`relative ${widthClass}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`h-8 w-full inline-flex items-center gap-2 bg-white border rounded-md px-3 text-sm font-medium text-[var(--text-main)] shadow-sm transition-colors whitespace-nowrap justify-between ${
          open ? "border-[var(--hs-link)] ring-1 ring-[var(--hs-link)]/30" : "border-[var(--border-color)] hover:border-[var(--primary-muted)]"
        }`}
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <ChevronDown size={13} className={`text-[var(--primary-muted)] shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-[9999] bg-white border border-[var(--border-color)] rounded-md shadow-lg min-w-full overflow-hidden py-1 max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left ${
                opt.value === value
                  ? "bg-[#fff1ee] text-[var(--hs-link)] font-semibold"
                  : "text-[var(--text-main)] font-medium hover:bg-[var(--background)]"
              }`}
            >
              <span className="truncate pr-3">{opt.label}</span>
              {opt.value === value && <Check size={13} className="text-[var(--hs-link)] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkflowsSettingsPage() {
  const router = useRouter();
  const { hasAccess, isAdmin } = usePermissions();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "name">("updated");
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createTrigger, setCreateTrigger] = useState<string>("lead_created");
  const [createEnrollment, setCreateEnrollment] = useState<"once" | "every_time">("every_time");
  const [createEnabled, setCreateEnabled] = useState(false);
  const [createEditorMode, setCreateEditorMode] = useState<"branches" | "canvas">("branches");
  const [schedulerLoading, setSchedulerLoading] = useState(true);
  const [schedulerEnabled, setSchedulerEnabled] = useState(true);
  const [schedulerSaving, setSchedulerSaving] = useState(false);

  const canManageWorkflowScheduler = isAdmin || hasAccess("settings:write");
  const canManageLeadAutomation =
    isAdmin || hasAccess("settings:write") || hasAccess("workflows:write");

  const resetCreateForm = useCallback(() => {
    setCreateName("");
    setCreateDesc("");
    setCreateTrigger("lead_created");
    setCreateEnrollment("every_time");
    setCreateEnabled(false);
    setCreateEditorMode("branches");
  }, []);

  const openCreateModal = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const submitCreateModal = () => {
    const name = createName.trim();
    if (name.length < 2) {
      toast.error("Enter a workflow name (at least 2 characters).");
      return;
    }
    const prefill: WorkflowCreatePrefill = {
      name,
      description: createDesc.trim() || undefined,
      trigger: createTrigger,
      enrollmentPolicy: createEnrollment,
      enabled: createEnabled,
      editorMode: createEditorMode,
    };
    try {
      sessionStorage.setItem(WORKFLOW_CREATE_PREFILL_KEY, JSON.stringify(prefill));
    } catch {
      toast.error("Could not start the builder. Try again.");
      return;
    }
    setCreateOpen(false);
    router.push("/crm/settings/workflows/new");
  };

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    const t = localStorage.getItem("token");
    try {
      const wRes = await fetch(`${CRM_API_URL}/crm/workflows`, { headers: { Authorization: `Bearer ${t}` } });
      if (wRes.status === 401) { router.push("/auth/login?error=unauthorized"); return; }
      if (wRes.ok) setWorkflows(await wRes.json());
    } catch {
      toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  useEffect(() => {
    if (!canManageWorkflowScheduler) {
      setSchedulerLoading(false);
      return;
    }
    const t = localStorage.getItem("token");
    let cancelled = false;
    void (async () => {
      setSchedulerLoading(true);
      try {
        const res = await fetch(`${CRM_API_URL}/crm/settings/workflow-scheduler`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSchedulerEnabled(data?.workflowSchedulerEnabled !== false);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setSchedulerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageWorkflowScheduler]);

  const saveWorkflowScheduler = async (enabled: boolean) => {
    const t = localStorage.getItem("token");
    setSchedulerSaving(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/workflow-scheduler`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ workflowSchedulerEnabled: enabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Could not save");
      }
      const data = await res.json();
      setSchedulerEnabled(data?.workflowSchedulerEnabled !== false);
      toast.success(enabled ? "Scheduled workflow runs enabled" : "Scheduled workflow runs paused");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSchedulerSaving(false);
    }
  };

  const filteredWorkflows = useMemo(() => {
    let list = [...workflows];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((w) => w.name.toLowerCase().includes(q) || (w.description && w.description.toLowerCase().includes(q)));
    if (statusFilter === "active") list = list.filter((w) => w.enabled);
    if (statusFilter === "paused") list = list.filter((w) => !w.enabled);
    if (triggerFilter !== "all") list = list.filter((w) => w.trigger === triggerFilter);
    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    }
    return list;
  }, [workflows, search, statusFilter, triggerFilter, sortBy]);

  const deleteWorkflow = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    const t = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/workflows/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) { toast.success("Workflow removed"); fetchWorkflows(); }
    else toast.error("Delete failed");
  };

  const duplicateWorkflow = async (id: string) => {
    const t = localStorage.getItem("token");
    setDuplicatingId(id);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/workflows/${id}`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) { toast.error("Could not load workflow to copy"); return; }
      const w: WorkflowApi = await res.json();
      const payload = buildDuplicatePayload(w);
      const createRes = await fetch(`${CRM_API_URL}/crm/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) { toast.error("Duplicate failed"); return; }
      const created = await createRes.json();
      toast.success("Workflow duplicated (paused)");
      await fetchWorkflows();
      if (created?._id) router.push(`/crm/settings/workflows/${created._id}`);
    } catch {
      toast.error("Duplicate failed");
    } finally {
      setDuplicatingId(null);
    }
  };

  const toggleEnabled = async (w: WorkflowRow) => {
    const t = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/workflows/${w._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ enabled: !w.enabled }),
    });
    if (res.ok) { toast.success(!w.enabled ? "Workflow turned on" : "Workflow paused"); fetchWorkflows(); }
    else toast.error("Update failed");
  };

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || triggerFilter !== "all" || sortBy !== "updated";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 md:pb-10 duration-500 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/crm/settings" className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors">
            <ChevronLeft size={14} /> Settings
          </Link>
          <h1 className="flex items-center gap-3 text-[22px] font-semibold text-[var(--text-main)]">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
              <GitBranch size={22} />
            </span>
            Workflows
          </h1>
          <p className="mt-1.5 text-sm text-[var(--primary-muted)]">
            Automate follow-ups with entry rules, branches, delays, and actions.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--hs-link-hover)] transition-colors"
          >
            <Plus size={16} />
            Create workflow
          </button>
          <button
            type="button"
            onClick={() => router.push("/crm/settings/workflows/new")}
            className="text-center text-sm font-medium text-[var(--text-muted)] hover:text-[var(--hs-link)] hover:underline underline-offset-4 transition-colors"
          >
            Open blank builder
          </button>
        </div>
      </div>

      {canManageWorkflowScheduler && (
        <div className="rounded-md border border-[var(--surface-dim)] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#e5f4f7] text-[var(--hs-link)]">
                <Timer size={20} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-main)]">Run scheduled workflow steps</h2>
                <p className="mt-0.5 max-w-xl text-xs leading-snug text-[var(--primary-muted)]">
                  When on, the server processes delays, send jitter, and &quot;wait for email open&quot; follow-ups. Turn off to pause all timed automation without disabling individual workflows.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:pl-4">
              {schedulerLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-muted)]" />
              ) : (
                <>
                  <span className="text-xs font-medium text-[var(--text-muted)]">
                    {schedulerEnabled ? "On" : "Off"}
                  </span>
                  <button
                    type="button"
                    disabled={schedulerSaving}
                    onClick={() => void saveWorkflowScheduler(!schedulerEnabled)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] shadow-sm hover:bg-[var(--background)] disabled:opacity-60"
                    aria-pressed={schedulerEnabled}
                  >
                    {schedulerSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : schedulerEnabled ? (
                      <ToggleRight className="h-5 w-5 text-[#00a38d]" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-[var(--primary-muted)]" />
                    )}
                    {schedulerEnabled ? "Enabled" : "Paused"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <LeadEngagementAutomationTemplates canEdit={canManageLeadAutomation} />

      <div className="space-y-4">
        {/* Filter bar */}
        {!loading && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)]">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workflows…"
                className="w-full h-8 pl-8 pr-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all"
              />
            </div>
            <Dropdown
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as "all" | "active" | "paused")}
              widthClass="min-w-[120px]"
              options={[
                { value: "all", label: "All status" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
              ]}
            />
            <Dropdown
              value={triggerFilter}
              onChange={setTriggerFilter}
              widthClass="min-w-[160px]"
              options={[
                { value: "all", label: "All triggers" },
                ...TRIGGERS.map((t) => ({ value: t.value, label: t.label })),
              ]}
            />
            <div className="ml-auto">
              <Dropdown
                value={sortBy}
                onChange={(v) => setSortBy(v as "updated" | "name")}
                widthClass="min-w-[160px]"
                options={[
                  { value: "updated", label: "Recently updated" },
                  { value: "name", label: "Name (A–Z)" },
                ]}
              />
            </div>
          </div>
        )}

        {/* States */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-[var(--primary-muted)]">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-sm font-medium">Loading workflows…</span>
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border-color)] bg-[var(--background)] px-6 py-20 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md bg-[#fff3f0] text-[var(--hs-link)]">
              <GitBranch size={26} />
            </div>
            <p className="text-sm font-semibold text-[var(--text-main)]">No workflows yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--primary-muted)]">
              Create your first automation to react to leads, contacts, or organizations — with branches, delays, and email steps.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors"
              >
                <Plus size={15} /> Create workflow
              </button>
              <button
                type="button"
                onClick={() => router.push("/crm/settings/workflows/new")}
                className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--hs-link)] hover:underline underline-offset-4"
              >
                Open blank builder
              </button>
            </div>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border-color)] bg-[var(--background)] px-6 py-12 text-center">
            <p className="font-semibold text-[var(--text-main)] text-sm">No workflows match your filters</p>
            <p className="mt-1 text-sm text-[var(--primary-muted)]">Try clearing search or changing status or trigger.</p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => { setSearch(""); setStatusFilter("all"); setTriggerFilter("all"); setSortBy("updated"); }}
                className="mt-4 text-sm font-semibold text-[var(--hs-link)] hover:underline underline-offset-4"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredWorkflows.map((w) => (
              <div
                key={w._id}
                className="group relative flex flex-col justify-between gap-4 overflow-hidden rounded-md border border-[var(--surface-dim)] bg-white py-5 pl-5 pr-4 shadow-sm transition-all hover:border-[var(--hs-link)]/30 hover:shadow-md md:flex-row md:items-center"
              >
                <div className="absolute bottom-3 left-0 top-3 w-1 rounded-full bg-[var(--hs-link)] opacity-60 transition-opacity group-hover:opacity-100" />
                <div className="min-w-0 pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-[var(--text-main)]">{w.name}</h3>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                      w.enabled
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : "bg-[var(--background)] text-[var(--primary-muted)] ring-1 ring-[var(--surface-dim)]"
                    }`}>
                      {w.enabled ? "Active" : "Paused"}
                    </span>
                    {w.editorMode === "canvas" && (
                      <span className="rounded-md bg-[var(--background)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)] ring-1 ring-[var(--surface-dim)]">
                        Canvas
                      </span>
                    )}
                  </div>
                  {w.description && (
                    <p className="mt-1 line-clamp-2 text-sm leading-snug text-[var(--primary-muted)]">{w.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--primary-muted)]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-muted)]">
                      <Zap size={12} className="shrink-0 text-[var(--hs-link)]" />
                      {TRIGGERS.find((t) => t.value === w.trigger)?.label || w.trigger}
                    </span>
                    {(w.enrollmentPolicy === "once" || w.onlyOncePerRecord) && (
                      <>
                        <span className="text-[var(--border-color)]">·</span>
                        <span>Enroll once per record</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleEnabled(w)}
                    className="rounded-md border border-[var(--surface-dim)] bg-white p-2 transition-colors hover:bg-[var(--background)]"
                    title={w.enabled ? "Pause" : "Enable"}
                  >
                    {w.enabled
                      ? <ToggleRight className="text-emerald-600" size={22} />
                      : <ToggleLeft className="text-[var(--primary-muted)]" size={22} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateWorkflow(w._id)}
                    disabled={duplicatingId === w._id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-main)] transition-colors hover:bg-[var(--background)] disabled:opacity-50"
                    title="Duplicate workflow"
                  >
                    {duplicatingId === w._id ? <Loader2 className="animate-spin" size={14} /> : <Copy size={14} />}
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/crm/settings/workflows/${w._id}`)}
                    className="rounded-md bg-[var(--hs-link)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--hs-link-hover)]"
                  >
                    Edit
                  </button>
                  {hasAccess("workflows:delete") && (
                    <button
                      type="button"
                      onClick={() => deleteWorkflow(w._id)}
                      className="rounded-md border border-transparent p-2 text-rose-500 transition-colors hover:border-rose-100 hover:bg-rose-50"
                      title="Delete workflow"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create workflow slide panel */}
      {createOpen && typeof document !== "undefined" && createPortal(
        <CrmSlidePanelShell
          isOpen={createOpen}
          onClose={() => { setCreateOpen(false); resetCreateForm(); }}
          title="Create workflow"
          subtitle="Name it, pick a trigger, then continue in the full builder."
          headerTone="hubspot"
          footer={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submitCreateModal}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm"
              >
                <Save size={15} />
                Continue to builder
              </button>
              <button
                type="button"
                onClick={() => { setCreateOpen(false); resetCreateForm(); }}
                className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className={LBL}>Workflow name <span className="text-[#f2545b]">*</span></label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCreateModal()}
                placeholder="e.g. New lead — welcome + task"
                className={INP}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className={LBL}>
                Description <span className="font-normal text-[var(--primary-muted)]">(optional)</span>
              </label>
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="What should this automation do?"
                className={`${TXA} min-h-[88px]`}
              />
            </div>

            {/* Trigger */}
            <div>
              <label className={LBL}>When it runs</label>
              <select value={createTrigger} onChange={(e) => setCreateTrigger(e.target.value)} className={SEL}>
                {TRIGGER_GROUPS.map((g) => (
                  <optgroup key={g.prefix} label={g.heading}>
                    {TRIGGERS.filter((t) => t.value.startsWith(g.prefix)).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Enrollment */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary-muted)] mb-2">Enrollment</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className={cn(
                  "flex flex-1 cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors",
                  createEnrollment === "every_time" ? "border-[var(--hs-link)] bg-[var(--background)]" : "border-[var(--border-color)] hover:bg-[var(--background)]"
                )}>
                  <input
                    type="radio"
                    name="wf-create-enroll"
                    className="mt-0.5 accent-[var(--hs-link)]"
                    checked={createEnrollment === "every_time"}
                    onChange={() => setCreateEnrollment("every_time")}
                  />
                  <span className="text-sm text-[var(--text-main)] leading-snug">Every time the trigger fires</span>
                </label>
                <label className={cn(
                  "flex flex-1 cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors",
                  createEnrollment === "once" ? "border-[var(--hs-link)] bg-[var(--background)]" : "border-[var(--border-color)] hover:bg-[var(--background)]"
                )}>
                  <input
                    type="radio"
                    name="wf-create-enroll"
                    className="mt-0.5 accent-[var(--hs-link)]"
                    checked={createEnrollment === "once"}
                    onChange={() => setCreateEnrollment("once")}
                  />
                  <span className="text-sm text-[var(--text-main)] leading-snug">Once per record</span>
                </label>
              </div>
            </div>

            {/* Builder type */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary-muted)] mb-2">Builder</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCreateEditorMode("branches")}
                  className={cn(
                    "rounded-md border px-3 py-3 text-left text-sm font-semibold transition-colors",
                    createEditorMode === "branches"
                      ? "border-[var(--hs-link)] bg-[#fff3f0] text-[var(--hs-link)]"
                      : "border-[var(--border-color)] bg-white text-[var(--text-main)] hover:bg-[var(--background)]"
                  )}
                >
                  Branch editor
                  <span className="mt-1 block text-xs font-normal text-[var(--primary-muted)]">If / else paths</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateEditorMode("canvas")}
                  className={cn(
                    "rounded-md border px-3 py-3 text-left text-sm font-semibold transition-colors",
                    createEditorMode === "canvas"
                      ? "border-[var(--hs-link)] bg-[#fff3f0] text-[var(--hs-link)]"
                      : "border-[var(--border-color)] bg-white text-[var(--text-main)] hover:bg-[var(--background)]"
                  )}
                >
                  Visual canvas
                  <span className="mt-1 block text-xs font-normal text-[var(--primary-muted)]">Drag &amp; connect</span>
                </button>
              </div>
            </div>

            {/* Enable immediately */}
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--border-color)] bg-white px-4 py-3 hover:bg-[var(--background)] transition-colors">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--hs-link)]"
                checked={createEnabled}
                onChange={(e) => setCreateEnabled(e.target.checked)}
              />
              <div>
                <span className="text-sm font-semibold text-[var(--text-main)]">Enable workflow immediately</span>
                <p className="mt-0.5 text-xs text-[var(--primary-muted)]">
                  Off by default so you can finish steps before anything runs.
                </p>
              </div>
            </label>
          </div>
        </CrmSlidePanelShell>,
        document.body
      )}
    </div>
  );
}
