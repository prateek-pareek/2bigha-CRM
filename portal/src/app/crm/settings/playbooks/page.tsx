"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ListChecks,
  Plus,
  Search,
  Edit2,
  Trash2,
  ChevronLeft,
  X,
  Save,
  Loader2,
  Copy,
  Archive,
  LayoutTemplate,
  BookOpen,
  ChevronDown,
  Check,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import {
  APPLIES_TO_LABEL,
  PLAYBOOK_SECTION_LABEL,
} from "@/lib/crm/playbook-ui";
import type {
  PlaybookApi,
  PlaybookRunnerQuestionForm,
  PlaybookSectionForm,
  PlaybookSectionType,
} from "@/lib/crm/playbook-types";
import RichTextEditor from '@/components/suite/editors/RichTextEditor';
import { cn } from "@/lib/utils";
import { crmModalChrome } from "@/lib/crm/chrome";
import { getFieldDefsForModule } from "@/lib/crm/crm-field-layout";
import type { WorkflowCanvasPipelineOption } from "@/lib/crm/workflow-canvas-graph";
import {
  allSalesStageNameOptions,
  getRecommendationPicklist,
  recordTypeToCrmModule,
} from "@/lib/crm/playbook-field-options";

const INP = "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[#b0c4d8] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/20 transition-all";
const TEXTAREA = "w-full bg-white border border-[var(--border-color)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] outline-none placeholder:text-[#b0c4d8] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/20 transition-all resize-y";
const LBL = "block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1";

const APPLIES_TO = [
  "Any",
  "Lead",
  "Deal",
  "Contact",
  "Organization",
  "Client",
] as const;

const SECTION_TYPES: PlaybookSectionType[] = [
  "script",
  "checklist",
  "qa",
  "notes",
];

function nid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptySection(order: number): PlaybookSectionForm {
  return { id: nid(), type: "script", order, title: "", html: "<p></p>" };
}

function emptyRunner(order: number): PlaybookRunnerQuestionForm {
  return {
    id: nid(),
    order,
    prompt: "",
    answerType: "text",
    options: [],
    crmTarget: "Deal",
    crmFieldPath: "",
  };
}

type BuilderForm = {
  name: string;
  description: string;
  appliesTo: (typeof APPLIES_TO)[number];
  status: "draft" | "published";
  category: string;
  team: string;
  salesStagesText: string;
  isActive: boolean;
  sections: PlaybookSectionForm[];
  runnerQuestions: PlaybookRunnerQuestionForm[];
  recRecordType: "Deal" | "Contact" | "Lead" | "";
  recTriggerMode: "field" | "email";
  recEmailEngagement:
    | "has_tracked_send"
    | "opened"
    | "not_opened"
    | "never_sent";
  recFieldPath: string;
  recOperator: "eq" | "in";
  recValuesText: string;
};

function apiToForm(p: PlaybookApi): BuilderForm {
  const trig = p.recommendationTrigger;
  return {
    name: p.name,
    description: p.description || "",
    appliesTo: (APPLIES_TO as readonly string[]).includes(p.appliesTo)
      ? (p.appliesTo as (typeof APPLIES_TO)[number])
      : "Any",
    status: p.status === "draft" ? "draft" : "published",
    category: p.category || "",
    team: p.team || "",
    salesStagesText: (p.salesStages || []).join(", "),
    isActive: p.isActive !== false,
    sections:
      (p.sections || []).length > 0
        ? [...p.sections!].sort((a, b) => a.order - b.order)
        : [emptySection(0)],
    runnerQuestions: [...(p.runnerQuestions || [])].sort(
      (a, b) => a.order - b.order,
    ),
    recRecordType: trig?.recordType
      ? (trig.recordType as "Deal" | "Contact" | "Lead")
      : "",
    recTriggerMode:
      trig?.triggerKind === "email_engagement" ? "email" : "field",
    recEmailEngagement: (() => {
      const eg = trig?.emailEngagement as BuilderForm["recEmailEngagement"] | undefined;
      if (
        eg === "has_tracked_send" ||
        eg === "opened" ||
        eg === "not_opened" ||
        eg === "never_sent"
      ) {
        return eg;
      }
      return "opened";
    })(),
    recFieldPath: trig?.fieldPath || "stage",
    recOperator: trig?.operator === "in" ? "in" : "eq",
    recValuesText: (trig?.values || []).join(", "),
  };
}

const EMPTY_FORM: BuilderForm = {
  name: "",
  description: "",
  appliesTo: "Any",
  status: "draft",
  category: "",
  team: "",
  salesStagesText: "",
  isActive: true,
  sections: [emptySection(0)],
  runnerQuestions: [],
  recRecordType: "",
  recTriggerMode: "field",
  recEmailEngagement: "opened",
  recFieldPath: "stage",
  recOperator: "eq",
  recValuesText: "",
};

function splitCommaValues(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function mergeUniqueSortedStrings(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b])).sort((x, y) => x.localeCompare(y));
}

function ToolbarSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((p) => !p)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm transition-all",
          disabled
            ? "cursor-not-allowed border-[var(--surface-dim)] bg-[var(--background)] text-[#b0c4d8]"
            : open
              ? "border-[var(--hs-link)] bg-[#fff8f6] ring-1 ring-[var(--hs-link)]/20"
              : "border-[var(--border-color)] bg-white text-[var(--text-main)] hover:border-[var(--hs-link)]/60 hover:bg-[#fff8f6]",
        )}
      >
        <span className={!disabled && selected ? "text-[var(--text-main)]" : "text-[#b0c4d8]"}>
          {selected?.label ?? placeholder ?? "Select…"}
        </span>
        <ChevronDown size={13} className={cn("shrink-0 transition-transform", open && !disabled ? "rotate-180 text-[var(--hs-link)]" : "text-[#b0c4d8]")} />
      </button>
      {open && !disabled && (
        <div className="absolute z-50 mt-1 min-w-full rounded-md border border-[var(--border-color)] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.10)] overflow-hidden max-h-60 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-[#fff3ef] hover:text-[#b94b36]",
                o.value === value ? "bg-[#fff3ef] text-[#b94b36] font-medium" : "text-[var(--text-main)]",
              )}
            >
              {o.label}
              {o.value === value && <Check size={12} className="shrink-0 text-[var(--hs-link)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)] shrink-0" />
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">{children}</p>
    </div>
  );
}

function CrmStringOptionChecklist({
  options,
  valueText,
  onChange,
  disabled,
  compact,
}: {
  options: string[];
  valueText: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected = new Set(splitCommaValues(valueText));
  const rows = mergeUniqueSortedStrings(options, [...selected]);
  return (
    <div
      className={cn(
        "space-y-1.5 overflow-y-auto rounded-md border border-[var(--border-color)] bg-white p-2",
        compact ? "max-h-28" : "max-h-36",
      )}
    >
      {rows.map((opt) => (
        <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-main)]">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-[var(--border-color)] accent-[var(--hs-link)]"
            checked={selected.has(opt)}
            disabled={disabled}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(opt);
              else next.delete(opt);
              onChange([...next].join(", "));
            }}
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

function CrmPipelineOptionPicklist({
  mode,
  options,
  valueText,
  onChange,
  disabled,
}: {
  mode: "eq" | "in";
  options: { id: string; label: string }[];
  valueText: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const selected = new Set(splitCommaValues(valueText));
  if (mode === "eq") {
    const cur = selected.size ? [...selected][0] : "";
    return (
      <ToolbarSelect
        value={cur}
        disabled={disabled}
        placeholder="— Select —"
        onChange={onChange}
        options={[{ value: "", label: "— Select —" }, ...options.map((o) => ({ value: o.id, label: o.label }))]}
      />
    );
  }
  const ids = mergeUniqueSortedStrings(options.map((o) => o.id), [...selected]);
  return (
    <div className="max-h-28 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border-color)] bg-white p-2">
      {ids.map((id) => {
        const label = options.find((o) => o.id === id)?.label || id;
        return (
          <label key={id} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-main)]">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-[var(--border-color)] accent-[var(--hs-link)]"
              checked={selected.has(id)}
              disabled={disabled}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(id);
                else next.delete(id);
                onChange([...next].join(", "));
              }}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

export default function PlaybooksSettingsPage() {
  const router = useRouter();
  const { hasAccess, isLoaded } = usePermissions();
  const canEdit = hasAccess("settings:write");

  const [playbooks, setPlaybooks] = useState<PlaybookApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "draft" | "published">("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlaybookApi | null>(null);
  const [form, setForm] = useState<BuilderForm>(EMPTY_FORM);
  const [templates, setTemplates] = useState<{ key: string; name: string; appliesTo: string }[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [pipelines, setPipelines] = useState<WorkflowCanvasPipelineOption[]>([]);
  const [customFieldsList, setCustomFieldsList] = useState<
    Array<{ key: string; name: string; type: string; options?: string[] }>
  >([]);

  const fetchPlaybooks = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const q = new URLSearchParams();
      q.set("admin", "true");
      if (filterStatus) q.set("status", filterStatus);
      if (includeArchived) q.set("includeArchived", "true");
      const res = await fetch(`${CRM_API_URL}/crm/playbooks?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.push("/auth/login?error=unauthorized"); return; }
      if (res.ok) {
        const data = await res.json();
        setPlaybooks(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
      setPlaybooks([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, includeArchived, router]);

  useEffect(() => { void fetchPlaybooks(); }, [fetchPlaybooks]);

  useEffect(() => {
    if (!canEdit) return;
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/playbooks/templates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => setTemplates([]));
  }, [canEdit]);

  useEffect(() => {
    if (!isModalOpen || !canEdit) return;
    const token = localStorage.getItem("token");
    let cancelled = false;
    const norm = (rows: unknown[]): WorkflowCanvasPipelineOption[] =>
      Array.isArray(rows)
        ? rows.map((raw) => {
            const p = raw as Record<string, unknown>;
            return {
              _id: String(p._id),
              name: String(p.name ?? ""),
              type: typeof p.type === "string" ? p.type : undefined,
              stages: Array.isArray(p.stages)
                ? (p.stages as { name?: string }[]).map((s) => ({ name: s.name != null ? String(s.name) : "" }))
                : [],
            };
          })
        : [];
    void Promise.all([
      fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([leads, deals]) => {
      if (cancelled) return;
      setPipelines([...norm(leads), ...norm(deals)]);
    });
    return () => { cancelled = true; };
  }, [isModalOpen, canEdit]);

  useEffect(() => {
    if (!isModalOpen || !canEdit) return;
    const mod = recordTypeToCrmModule(form.recRecordType);
    if (!mod) { setCustomFieldsList([]); return; }
    const token = localStorage.getItem("token");
    let cancelled = false;
    void fetch(`${CRM_API_URL}/custom-fields?module=${mod}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setCustomFieldsList(Array.isArray(data) ? data : []); });
    return () => { cancelled = true; };
  }, [isModalOpen, canEdit, form.recRecordType]);

  const openCreate = () => {
    if (!canEdit) return;
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (p: PlaybookApi) => {
    if (!canEdit) return;
    setEditing(p);
    setForm(apiToForm(p));
    setIsModalOpen(true);
  };

  const buildPayload = (status: "draft" | "published") => {
    const salesStages = form.salesStagesText.split(",").map((s) => s.trim()).filter(Boolean);
    const recVals = form.recValuesText.split(",").map((s) => s.trim()).filter(Boolean);
    const recommendationTrigger =
      form.recRecordType && form.recTriggerMode === "email"
        ? { recordType: form.recRecordType, triggerKind: "email_engagement" as const, emailEngagement: form.recEmailEngagement, fieldPath: "_email_engagement", operator: "eq" as const, values: [form.recEmailEngagement] }
        : form.recRecordType && recVals.length > 0
          ? { recordType: form.recRecordType, triggerKind: "field" as const, fieldPath: form.recFieldPath.trim() || "stage", operator: form.recOperator, values: recVals }
          : null;
    return {
      name: form.name.trim() || "Untitled playbook",
      description: form.description.trim(),
      appliesTo: form.appliesTo,
      status,
      category: form.category.trim(),
      team: form.team.trim(),
      salesStages,
      isActive: form.isActive,
      sections: form.sections.map((s, i) => ({ ...s, order: i })),
      runnerQuestions: form.runnerQuestions.map((q, i) => ({ ...q, order: i, options: q.answerType === "text" ? [] : q.options })),
      recommendationTrigger,
    };
  };

  const saveWithStatus = async (status: "draft" | "published") => {
    if (!canEdit) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    const payload = buildPayload(status);
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${CRM_API_URL}/crm/playbooks/${editing._id}` : `${CRM_API_URL}/crm/playbooks`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(status === "published" ? "Playbook published" : "Draft saved");
        setIsModalOpen(false);
        void fetchPlaybooks();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to save");
      }
    } catch (e) {
      console.error(e);
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const createFromTemplate = async () => {
    if (!canEdit || !templateKey) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/playbooks/from-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateKey }),
      });
      if (res.ok) {
        const created = await res.json();
        toast.success("Playbook created from template");
        setTemplateKey("");
        void fetchPlaybooks();
        if (created?._id) openEdit(created as PlaybookApi);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canEdit || !confirm("Delete this playbook permanently?")) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/playbooks/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { toast.success("Playbook deleted"); void fetchPlaybooks(); }
    else toast.error("Failed to delete");
  };

  const handleClone = async (id: string) => {
    if (!canEdit) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/playbooks/${id}/clone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { toast.success("Playbook cloned"); void fetchPlaybooks(); }
    else toast.error("Clone failed");
  };

  const handleArchive = async (id: string, archived: boolean) => {
    if (!canEdit) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/playbooks/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ archived }),
    });
    if (res.ok) { toast.success(archived ? "Archived" : "Restored"); void fetchPlaybooks(); }
    else toast.error("Update failed");
  };

  const salesStageNameOptions = useMemo(() => allSalesStageNameOptions(pipelines), [pipelines]);
  const salesStageRows = useMemo(
    () => mergeUniqueSortedStrings(salesStageNameOptions, splitCommaValues(form.salesStagesText)),
    [salesStageNameOptions, form.salesStagesText],
  );

  const recFieldSelectOptions = useMemo(() => {
    const mod = recordTypeToCrmModule(form.recRecordType);
    if (!mod) return [];
    const defs = getFieldDefsForModule(mod);
    const core = defs.map((d) => ({ value: d.key, label: d.label }));
    const custom = customFieldsList.map((cf) => ({ value: `customFields.${cf.key}`, label: `${cf.name} (custom)` }));
    const merged = [...core, ...custom].sort((a, b) => a.label.localeCompare(b.label));
    const cur = form.recFieldPath.trim();
    if (cur && !merged.some((m) => m.value === cur)) {
      return [...merged, { value: cur, label: `${cur} (custom path)` }].sort((a, b) => a.label.localeCompare(b.label));
    }
    return merged;
  }, [form.recRecordType, form.recFieldPath, customFieldsList]);

  const recCustomFieldMeta = useMemo(() => {
    const path = form.recFieldPath.trim();
    if (!path.startsWith("customFields.")) return null;
    const key = path.slice("customFields.".length);
    return customFieldsList.find((c) => c.key === key) ?? null;
  }, [form.recFieldPath, customFieldsList]);

  const recPicklist = useMemo(() => {
    if (!form.recRecordType) return null;
    return getRecommendationPicklist(form.recRecordType, form.recFieldPath, pipelines, recCustomFieldMeta);
  }, [form.recRecordType, form.recFieldPath, pipelines, recCustomFieldMeta]);

  const filteredLocal = playbooks.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  if (!isLoaded) {
    return <div className="h-40 animate-pulse rounded-md bg-[var(--surface-dim)]" />;
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Page header card */}
      <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/crm/settings"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)]"
              aria-label="Back to settings"
            >
              <ChevronLeft size={16} />
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--hs-link)]/10">
              <ListChecks className="h-4 w-4 text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[var(--text-main)]">Playbook Builder</h1>
              <p className="text-xs text-[var(--primary-muted)]">
                Sections, live runner Q&amp;A, stage-based recommendations
              </p>
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#e8674a]"
            >
              <Plus size={15} />
              Create playbook
            </button>
          )}
        </div>

        {/* Toolbar: template picker + filters */}
        <div className="flex flex-wrap items-end gap-4 border-b border-[var(--surface-dim)] bg-white px-6 py-4">
          {canEdit && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Start from template</p>
                <div className="flex items-center gap-2">
                  <LayoutTemplate size={14} className="shrink-0 text-[var(--hs-link)]" />
                  <ToolbarSelect
                    value={templateKey}
                    onChange={setTemplateKey}
                    placeholder="Choose template…"
                    options={templates.map((t) => ({ value: t.key, label: `${t.name} (${t.appliesTo})` }))}
                  />
                  <button
                    type="button"
                    disabled={!templateKey || saving}
                    onClick={() => void createFromTemplate()}
                    className="h-9 rounded-md border border-[var(--hs-link)] bg-[#e8f7fa] px-3.5 text-sm font-semibold text-[var(--hs-link)] transition-all hover:bg-[#d0eff5] disabled:opacity-40"
                  >
                    Use template
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 ml-auto">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Status</p>
              <ToolbarSelect
                value={filterStatus}
                onChange={(v) => setFilterStatus(v as "" | "draft" | "published")}
                options={[
                  { value: "", label: "All statuses" },
                  { value: "draft", label: "Drafts only" },
                  { value: "published", label: "Published only" },
                ]}
              />
            </div>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border-color)] accent-[var(--hs-link)]"
              />
              Show archived
            </label>
          </div>
        </div>

        {!canEdit && (
          <div className="mx-6 my-4 flex items-center gap-2.5 rounded-md border border-[#f5d78e] bg-[#fff8e6] px-4 py-3">
            <p className="text-sm text-[#7c5c0a]">
              You need <strong className="font-semibold">settings:write</strong> to edit playbooks.
            </p>
          </div>
        )}

        {/* Search + grid */}
        <div className="px-6 py-4">
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--primary-muted)]" />
            <input
              type="text"
              placeholder="Search playbooks…"
              className="h-9 w-full rounded-md border border-[var(--border-color)] bg-white pl-9 pr-3 text-sm text-[var(--text-main)] placeholder:text-[#b0c4d8] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/20 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-md bg-[var(--surface-dim)]" />
              ))}
            </div>
          ) : filteredLocal.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--background)]">
                <BookOpen className="h-5 w-5 text-[var(--primary-muted)]" />
              </div>
              <p className="text-sm text-[var(--primary-muted)]">No playbooks match your filters.</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
                >
                  <Plus size={14} /> Create your first playbook
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLocal.map((p) => (
                <div
                  key={p._id}
                  className="flex flex-col rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
                >
                  {/* Card header strip */}
                  <div className="flex items-start justify-between gap-2 border-b border-[var(--surface-dim)] px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
                          p.status === "draft"
                            ? "border-[#f5d78e] bg-[#fff8e6] text-[#7c5c0a]"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {p.status === "draft" ? "Draft" : "Published"}
                      </span>
                      {p.archived && (
                        <span className="inline-flex items-center rounded-md border border-[var(--border-color)] bg-[var(--background)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          Archived
                        </span>
                      )}
                      {!p.isActive && (
                        <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-rose-700">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
                    <h3 className="text-sm font-semibold leading-snug text-[var(--text-main)]">{p.name}</h3>
                    {p.description && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-[var(--primary-muted)]">{p.description}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-[var(--surface-dim)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                        {APPLIES_TO_LABEL[p.appliesTo] || p.appliesTo}
                      </span>
                      {p.category && (
                        <span className="rounded-md bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                          {p.category}
                        </span>
                      )}
                      {p.team && (
                        <span className="rounded-md bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                          {p.team}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card actions */}
                  {canEdit && (
                    <div className="flex items-center gap-0.5 border-t border-[var(--surface-dim)] px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)] transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClone(p._id)}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)] transition-colors"
                        title="Clone"
                      >
                        <Copy size={13} /> Clone
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleArchive(p._id, !p.archived)}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)] transition-colors"
                        title={p.archived ? "Unarchive" : "Archive"}
                      >
                        <Archive size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(p._id)}
                        className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {isModalOpen && canEdit && (
        <div className={`${crmModalChrome.overlay} z-50 flex items-center justify-center bg-[var(--text-main)]/40 p-4`}>
          <div
            className={`${crmModalChrome.centerShell} crm-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="playbook-modal-title"
          >
            {/* Modal header */}
            <div className={`${crmModalChrome.centerHeader} border-b border-[var(--border-color)] bg-white`}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--hs-link)]/10">
                  <ListChecks className="h-3.5 w-3.5 text-[var(--hs-link)]" />
                </div>
                <h2 id="playbook-modal-title" className="text-sm font-semibold text-[var(--text-main)]">
                  {editing ? "Edit playbook" : "Create playbook"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md p-1.5 text-[var(--primary-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              {/* Basic info */}
              <div>
                <SectionLabel>Basic info</SectionLabel>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={LBL} htmlFor="pb-name">Name</label>
                    <input
                      id="pb-name"
                      className={INP}
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Discovery call playbook"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LBL}>Description</label>
                    <textarea
                      className={cn(TEXTAREA, "min-h-[72px]")}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="What is this playbook for?"
                    />
                  </div>
                  <div>
                    <label className={LBL}>Record type</label>
                    <ToolbarSelect
                      value={form.appliesTo}
                      onChange={(v) => setForm((f) => ({ ...f, appliesTo: v as (typeof APPLIES_TO)[number] }))}
                      options={APPLIES_TO.map((v) => ({ value: v, label: APPLIES_TO_LABEL[v] || v }))}
                    />
                  </div>
                  <div>
                    <label className={LBL}>Visibility</label>
                    <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-[var(--text-main)]">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                        className="h-4 w-4 rounded border-[var(--border-color)] accent-[var(--hs-link)]"
                      />
                      Active (visible to reps)
                    </label>
                  </div>
                  <div>
                    <label className={LBL}>Category</label>
                    <input
                      className={INP}
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Sales"
                    />
                  </div>
                  <div>
                    <label className={LBL}>Team</label>
                    <input
                      className={INP}
                      value={form.team}
                      onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}
                      placeholder="e.g. SDR Team"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LBL}>Sales stages</label>
                    <p className="mb-1.5 text-xs text-[var(--primary-muted)]">
                      Choose from pipeline stages. Custom names you already saved stay listed.
                    </p>
                    {salesStageRows.length > 0 ? (
                      <CrmStringOptionChecklist
                        options={salesStageNameOptions}
                        valueText={form.salesStagesText}
                        disabled={!canEdit}
                        onChange={(next) => setForm((f) => ({ ...f, salesStagesText: next }))}
                      />
                    ) : (
                      <input
                        className={INP}
                        value={form.salesStagesText}
                        onChange={(e) => setForm((f) => ({ ...f, salesStagesText: e.target.value }))}
                        placeholder="Qualification, Proposal"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Recommendation trigger */}
              <div className="border-t border-[var(--surface-dim)] pt-5">
                <SectionLabel>Recommendation trigger (banner on record)</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ToolbarSelect
                    value={form.recRecordType}
                    onChange={(next) => {
                      setForm((f) => ({ ...f, recRecordType: next as BuilderForm["recRecordType"], recFieldPath: next ? "stage" : "", recValuesText: "", recTriggerMode: "field" }));
                    }}
                    options={[
                      { value: "", label: "No auto-recommendation" },
                      { value: "Deal", label: "Deal" },
                      { value: "Contact", label: "Contact" },
                      { value: "Lead", label: "Lead" },
                    ]}
                  />
                  <ToolbarSelect
                    value={form.recRecordType ? form.recTriggerMode : ""}
                    disabled={!form.recRecordType}
                    onChange={(mode) => {
                      setForm((f) => ({ ...f, recTriggerMode: mode as "field" | "email", recValuesText: mode === "field" ? f.recValuesText : "" }));
                    }}
                    placeholder="Select record type first"
                    options={[
                      { value: "field", label: "When CRM field matches…" },
                      { value: "email", label: "When email activity matches…" },
                    ]}
                  />
                  {form.recRecordType && form.recTriggerMode === "email" ? (
                    <ToolbarSelect
                      className="sm:col-span-2"
                      value={form.recEmailEngagement}
                      onChange={(v) => setForm((f) => ({ ...f, recEmailEngagement: v as BuilderForm["recEmailEngagement"] }))}
                      options={[
                        { value: "has_tracked_send", label: "At least one tracked CRM send exists for this record" },
                        { value: "opened", label: "At least one tracked send was opened (pixel)" },
                        { value: "not_opened", label: "Tracked send(s) exist but none opened yet" },
                        { value: "never_sent", label: "No tracked CRM sends on this record yet" },
                      ]}
                    />
                  ) : (
                    <>
                      <ToolbarSelect
                        value={form.recRecordType && recFieldSelectOptions.some((o) => o.value === form.recFieldPath) ? form.recFieldPath : ""}
                        disabled={!form.recRecordType}
                        placeholder={form.recRecordType ? "— Field —" : "Select record type first"}
                        onChange={(v) => setForm((f) => ({ ...f, recFieldPath: v, recValuesText: "" }))}
                        options={recFieldSelectOptions}
                      />
                      <ToolbarSelect
                        value={form.recOperator}
                        disabled={!form.recRecordType}
                        onChange={(v) => setForm((f) => ({ ...f, recOperator: v as "eq" | "in" }))}
                        options={[
                          { value: "eq", label: "Equals" },
                          { value: "in", label: "One of (multi-select)" },
                        ]}
                      />
                    </>
                  )}
                  {!form.recRecordType ? (
                    <input className={cn(INP, "cursor-not-allowed bg-[var(--background)] text-[#b0c4d8]")} disabled placeholder="Enable recommendation to set values" />
                  ) : form.recTriggerMode === "email" ? (
                    <p className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text-muted)] sm:col-span-2">
                      The banner only appears on matching record types when this email condition is true.
                    </p>
                  ) : recPicklist?.mode === "strings" ? (
                    form.recOperator === "eq" ? (
                      <ToolbarSelect
                        value={splitCommaValues(form.recValuesText)[0] ?? ""}
                        onChange={(v) => setForm((f) => ({ ...f, recValuesText: v }))}
                        placeholder="— Select value —"
                        options={mergeUniqueSortedStrings(recPicklist.options, splitCommaValues(form.recValuesText)).map((opt) => ({ value: opt, label: opt }))}
                      />
                    ) : (
                      <CrmStringOptionChecklist
                        compact
                        options={recPicklist.options}
                        valueText={form.recValuesText}
                        disabled={!canEdit}
                        onChange={(next) => setForm((f) => ({ ...f, recValuesText: next }))}
                      />
                    )
                  ) : recPicklist?.mode === "pipelines" ? (
                    <CrmPipelineOptionPicklist
                      mode={form.recOperator}
                      options={recPicklist.options}
                      valueText={form.recValuesText}
                      disabled={!canEdit}
                      onChange={(next) => setForm((f) => ({ ...f, recValuesText: next }))}
                    />
                  ) : (
                    <input
                      className={INP}
                      value={form.recValuesText}
                      onChange={(e) => setForm((f) => ({ ...f, recValuesText: e.target.value }))}
                      placeholder="Value(s), comma-separated"
                    />
                  )}
                </div>
              </div>

              {/* Sections */}
              <div className="border-t border-[var(--surface-dim)] pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <SectionLabel>Sections</SectionLabel>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--hs-link)] hover:underline"
                    onClick={() => setForm((f) => ({ ...f, sections: [...f.sections, emptySection(f.sections.length)] }))}
                  >
                    + Add section
                  </button>
                </div>
                <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
                  {form.sections.map((sec, idx) => (
                    <div key={sec.id} className="rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] p-3">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <ToolbarSelect
                          className="w-40 shrink-0"
                          value={sec.type}
                          onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((s, i) => i === idx ? { ...s, type: v as PlaybookSectionType } : s) }))}
                          options={SECTION_TYPES.map((t) => ({ value: t, label: PLAYBOOK_SECTION_LABEL[t] }))}
                        />
                        <input
                          className={cn(INP, "min-w-[8rem] flex-1")}
                          placeholder="Section title"
                          value={sec.title}
                          onChange={(e) => setForm((f) => ({ ...f, sections: f.sections.map((s, i) => i === idx ? { ...s, title: e.target.value } : s) }))}
                        />
                        {form.sections.length > 1 && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                            onClick={() => setForm((f) => ({ ...f, sections: f.sections.filter((_, i) => i !== idx) }))}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <RichTextEditor
                        content={sec.html}
                        onChange={(html) => setForm((f) => ({ ...f, sections: f.sections.map((s, i) => i === idx ? { ...s, html } : s) }))}
                        placeholder="Script, checklist, Q&A…"
                        className="!min-h-[120px] !max-h-[200px]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Runner questions */}
              <div className="border-t border-[var(--surface-dim)] pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <SectionLabel>Live runner questions</SectionLabel>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--hs-link)] hover:underline"
                    onClick={() => setForm((f) => ({ ...f, runnerQuestions: [...f.runnerQuestions, emptyRunner(f.runnerQuestions.length)] }))}
                  >
                    + Add question
                  </button>
                </div>
                <div className="max-h-[32vh] space-y-3 overflow-y-auto">
                  {form.runnerQuestions.map((rq, idx) => (
                    <div key={rq.id} className="space-y-2 rounded-md border border-[var(--border-color)] p-3">
                      <input
                        className={INP}
                        placeholder="Question prompt"
                        value={rq.prompt}
                        onChange={(e) => setForm((f) => ({ ...f, runnerQuestions: f.runnerQuestions.map((q, i) => i === idx ? { ...q, prompt: e.target.value } : q) }))}
                      />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <ToolbarSelect
                          value={rq.answerType}
                          onChange={(v) => setForm((f) => ({ ...f, runnerQuestions: f.runnerQuestions.map((q, i) => i === idx ? { ...q, answerType: v as PlaybookRunnerQuestionForm["answerType"] } : q) }))}
                          options={[
                            { value: "text", label: "Text" },
                            { value: "dropdown", label: "Dropdown" },
                            { value: "checkbox", label: "Checkboxes" },
                          ]}
                        />
                        <ToolbarSelect
                          value={rq.crmTarget}
                          onChange={(v) => setForm((f) => ({ ...f, runnerQuestions: f.runnerQuestions.map((q, i) => i === idx ? { ...q, crmTarget: v as PlaybookRunnerQuestionForm["crmTarget"] } : q) }))}
                          options={[
                            { value: "Deal", label: "Map to Deal" },
                            { value: "Contact", label: "Map to Contact" },
                            { value: "Lead", label: "Map to Lead" },
                          ]}
                        />
                        <input
                          className={INP}
                          placeholder="CRM field path"
                          value={rq.crmFieldPath}
                          onChange={(e) => setForm((f) => ({ ...f, runnerQuestions: f.runnerQuestions.map((q, i) => i === idx ? { ...q, crmFieldPath: e.target.value } : q) }))}
                        />
                      </div>
                      {rq.answerType !== "text" && (
                        <textarea
                          className={cn(TEXTAREA, "min-h-[64px] text-xs")}
                          placeholder="One option per line"
                          value={rq.options.join("\n")}
                          onChange={(e) => setForm((f) => ({ ...f, runnerQuestions: f.runnerQuestions.map((q, i) => i === idx ? { ...q, options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } : q) }))}
                        />
                      )}
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                        onClick={() => setForm((f) => ({ ...f, runnerQuestions: f.runnerQuestions.filter((_, i) => i !== idx) }))}
                      >
                        Remove question
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-3.5">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveWithStatus("draft")}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="animate-spin" size={14} /> : null}
                Save draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveWithStatus("published")}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e8674a] disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
