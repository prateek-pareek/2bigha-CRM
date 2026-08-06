"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Pencil,
  Plus,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";

const HS_PANEL =
  "rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]";

const STRATEGIES_API = `${CRM_API_URL}/crm/sales-strategies`;

type StrategyStatus = "draft" | "active" | "completed" | "archived";

type StrategyGoal = {
  title: string;
  metric?: string;
  target?: string;
};

type StrategyRow = {
  _id: string;
  title: string;
  summary?: string;
  objective?: string;
  status: StrategyStatus;
  segments: string[];
  motionTypes: string[];
  icpNotes: string[];
  channels: string[];
  playbookSteps: string[];
  keyMessages: string[];
  goals: StrategyGoal[];
  startDate?: string;
  endDate?: string;
  quotaTarget?: string;
  tags: string[];
  authorizedUserIds?: string[];
  updatedAt?: string;
};

type CrmPortalUser = {
  _id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
};

const STATUS_OPTIONS: StrategyStatus[] = [
  "draft",
  "active",
  "completed",
  "archived",
];

const MOTION_SUGGESTIONS = [
  "Outbound",
  "Inbound",
  "Partner / referral",
  "Expansion / upsell",
  "Product-led",
  "Events / webinars",
];

const SEGMENT_SUGGESTIONS = [
  "Enterprise",
  "Mid-market",
  "SMB",
  "Startup",
  "IT services buyers",
  "Product companies",
];

const CHANNEL_SUGGESTIONS = [
  "Cold email",
  "LinkedIn",
  "Warm intro",
  "Website / SEO",
  "Demo request",
  "Partner channel",
  "WhatsApp",
  "Events",
];

const PRESETS: Array<{
  label: string;
  apply: () => ReturnType<typeof emptyForm>;
}> = [
  {
    label: "Enterprise outbound",
    apply: () => ({
      ...emptyForm(),
      title: "Enterprise outbound (IT services)",
      summary:
        "Target decision-makers at mid/large IT buyers with multi-touch outbound.",
      objective: "Book qualified discovery calls with VP Eng / CTO / Head of Delivery",
      status: "draft",
      segments: "Enterprise, Mid-market, IT services buyers",
      motionTypes: "Outbound",
      channels: "Cold email, LinkedIn, Warm intro",
      icpNotes:
        "50–500 eng, active hiring or modernization, India / US / EU timezone overlap",
      playbookSteps:
        "Research account, Multi-thread 2–3 contacts, Value email + LinkedIn, Book discovery, Qualify MEDDIC-lite",
      keyMessages:
        "Faster delivery with senior engineers, Transparent ownership, Proven IT product build track record",
      goals: [
        { title: "Discovery calls / month", metric: "Meetings", target: "12" },
        { title: "Pipeline created", metric: "INR", target: "40L" },
      ],
      tags: "enterprise, outbound",
    }),
  },
  {
    label: "Inbound product demo",
    apply: () => ({
      ...emptyForm(),
      title: "Inbound demo → close",
      summary: "Convert website / SEO / referral demos into closed-won deals.",
      objective: "Improve demo-to-proposal conversion with a clear discovery cadence",
      status: "draft",
      segments: "SMB, Mid-market, Product companies",
      motionTypes: "Inbound, Product-led",
      channels: "Website / SEO, Demo request, Partner channel",
      playbookSteps:
        "Same-day response, Discovery call, Scope + proposal, Stakeholder alignment, Negotiation + close",
      keyMessages:
        "Clear scope and timeline, Fixed-price options, Dedicated delivery lead",
      goals: [
        { title: "Demo → proposal rate", metric: "%", target: "60" },
        { title: "Avg days to close", metric: "Days", target: "21" },
      ],
      tags: "inbound, demos",
    }),
  },
  {
    label: "Expansion / upsell",
    apply: () => ({
      ...emptyForm(),
      title: "Client expansion playbook",
      summary: "Grow revenue from existing clients with new modules and retainers.",
      objective: "Increase net revenue retention via structured QBR + expansion offers",
      status: "draft",
      segments: "Existing clients",
      motionTypes: "Expansion / upsell",
      channels: "Warm intro, Events, WhatsApp",
      playbookSteps:
        "Health check, QBR, Gap analysis, Expansion proposal, Close + kickoff",
      keyMessages:
        "Compound value on current delivery, Lower ramp risk, Shared roadmap",
      goals: [
        { title: "Expansion pipeline", metric: "INR", target: "25L" },
        { title: "QBRs completed", metric: "Count", target: "8" },
      ],
      tags: "expansion, retention",
    }),
  },
];

function emptyForm() {
  return {
    title: "",
    summary: "",
    objective: "",
    status: "draft" as StrategyStatus,
    segments: "",
    motionTypes: "",
    icpNotes: "",
    channels: "",
    playbookSteps: "",
    keyMessages: "",
    goals: [] as StrategyGoal[],
    startDate: "",
    endDate: "",
    quotaTarget: "",
    tags: "",
    authorizedUserIds: [] as string[],
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinList(values?: string[]): string {
  return (values || []).join(", ");
}

function userLabel(u: CrmPortalUser): string {
  if (u.fullName?.trim()) return u.fullName.trim();
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  return u.email || u._id;
}

function ChipToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-[var(--hs-link)] bg-[var(--hs-link)]/10 text-[var(--hs-link)]"
          : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--background)]"
      }`}
    >
      {label}
    </button>
  );
}

function toggleCsvToken(csv: string, token: string): string {
  const parts = splitCsv(csv);
  const key = token.toLowerCase();
  const exists = parts.some((p) => p.toLowerCase() === key);
  const next = exists
    ? parts.filter((p) => p.toLowerCase() !== key)
    : [...parts, token];
  return next.join(", ");
}

export default function CrmSalesStrategiesPage() {
  const router = useRouter();
  const { hasAccess, isLoaded, isAdmin, user } = usePermissions();
  const canRead = hasAccess("strategies:read") || isAdmin;
  const canWrite =
    hasAccess("strategies:write") ||
    hasAccess("strategies:create") ||
    hasAccess("strategies:update") ||
    isAdmin;

  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | StrategyStatus>(
    "all",
  );
  const [motionFilter, setMotionFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StrategyRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [portalUsers, setPortalUsers] = useState<CrmPortalUser[]>([]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!canRead) {
      router.replace("/unauthorized?module=crm");
    }
  }, [isLoaded, canRead, router]);

  const load = useCallback(async () => {
    const token = getCrmAuthToken();
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(STRATEGIES_API, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 403) {
        setRows([]);
        toast.error("You do not have access to sales strategies.");
        return;
      }
      const data = await res.json().catch(() => []);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void load();
  }, [canRead, load]);

  useEffect(() => {
    if (!canWrite) return;
    const token = getCrmAuthToken();
    if (!token) return;
    fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPortalUsers(data);
      })
      .catch(() => {});
  }, [canWrite]);

  const counts = useMemo(() => {
    const base = {
      all: rows.length,
      draft: 0,
      active: 0,
      completed: 0,
      archived: 0,
    };
    for (const row of rows) {
      if (row.status in base) base[row.status as StrategyStatus] += 1;
    }
    return base;
  }, [rows]);

  const motionOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      for (const m of row.motionTypes || []) {
        const key = m.trim().toLowerCase();
        if (!key) continue;
        if (!map.has(key)) map.set(key, m.trim());
      }
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (motionFilter !== "all") {
        const hit = (row.motionTypes || []).some(
          (m) => m.trim().toLowerCase() === motionFilter,
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, statusFilter, motionFilter]);

  const openNew = () => {
    setEditing(null);
    const myEmail = String(user?.email || "").toLowerCase();
    const me = portalUsers.find(
      (u) => String(u.email || "").toLowerCase() === myEmail,
    );
    setForm({
      ...emptyForm(),
      authorizedUserIds: me?._id ? [String(me._id)] : [],
    });
    setOpen(true);
  };

  const openEdit = (row: StrategyRow) => {
    setEditing(row);
    setForm({
      title: row.title || "",
      summary: row.summary || "",
      objective: row.objective || "",
      status: row.status || "draft",
      segments: joinList(row.segments),
      motionTypes: joinList(row.motionTypes),
      icpNotes: joinList(row.icpNotes),
      channels: joinList(row.channels),
      playbookSteps: joinList(row.playbookSteps),
      keyMessages: joinList(row.keyMessages),
      goals: Array.isArray(row.goals) ? row.goals : [],
      startDate: row.startDate ? String(row.startDate).slice(0, 10) : "",
      endDate: row.endDate ? String(row.endDate).slice(0, 10) : "",
      quotaTarget: row.quotaTarget || "",
      tags: joinList(row.tags),
      authorizedUserIds: (row.authorizedUserIds || []).map(String),
    });
    setOpen(true);
  };

  const save = async () => {
    const token = getCrmAuthToken();
    if (!token) return;
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        summary: form.summary.trim() || undefined,
        objective: form.objective.trim() || undefined,
        status: form.status,
        segments: splitCsv(form.segments),
        motionTypes: splitCsv(form.motionTypes),
        icpNotes: splitCsv(form.icpNotes),
        channels: splitCsv(form.channels),
        playbookSteps: splitCsv(form.playbookSteps),
        keyMessages: splitCsv(form.keyMessages),
        goals: form.goals
          .map((g) => ({
            title: String(g.title || "").trim(),
            metric: String(g.metric || "").trim() || undefined,
            target: String(g.target || "").trim() || undefined,
          }))
          .filter((g) => g.title),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        quotaTarget: form.quotaTarget.trim() || undefined,
        tags: splitCsv(form.tags),
        authorizedUserIds: form.authorizedUserIds,
      };
      const url = editing
        ? `${STRATEGIES_API}/${editing._id}`
        : STRATEGIES_API;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data?.message === "string" ? data.message : "Save failed",
        );
        return;
      }
      toast.success(editing ? "Strategy updated." : "Strategy created.");
      setOpen(false);
      void load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const token = getCrmAuthToken();
    if (!token) return;
    if (!confirm("Delete this sales strategy?")) return;
    const res = await fetch(`${STRATEGIES_API}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      toast.error("Could not delete strategy.");
      return;
    }
    toast.success("Strategy deleted.");
    void load();
  };

  if (!isLoaded || !canRead) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--text-main)] flex items-center gap-2">
            <Target className="h-6 w-6 text-[var(--hs-link)]" />
            Sales strategies
          </h1>
          <p className="mt-1 text-sm text-[var(--primary-muted)]">
            Authorized playbooks for outbound, inbound, and expansion — controlled via
            Staff CRM permissions (<code className="text-xs">strategies:read</code> /{" "}
            <code className="text-xs">strategies:write</code>) plus per-strategy access.
          </p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            className="rounded-md bg-[var(--hs-link)] font-semibold"
            onClick={openNew}
          >
            <Plus className="h-4 w-4 mr-2" />
            New strategy
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(["all", ...STATUS_OPTIONS] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                statusFilter === s
                  ? "border-[var(--hs-link)] bg-[var(--hs-link)]/10 text-[var(--hs-link)]"
                  : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--background)]"
              }`}
            >
              {s} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
        {motionOptions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Motion
            </span>
            <button
              type="button"
              onClick={() => setMotionFilter("all")}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                motionFilter === "all"
                  ? "border-[var(--hs-link)] bg-[var(--hs-link)]/10 text-[var(--hs-link)]"
                  : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--background)]"
              }`}
            >
              All motions
            </button>
            {motionOptions.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMotionFilter(m.key)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  motionFilter === m.key
                    ? "border-[var(--hs-link)] bg-[var(--hs-link)]/10 text-[var(--hs-link)]"
                    : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--background)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`${HS_PANEL} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Target className="mx-auto h-10 w-10 text-[var(--text-muted)] opacity-40" />
            <p className="mt-3 font-medium text-[var(--text-main)]">
              {rows.length === 0
                ? "No sales strategies yet"
                : "No strategies match these filters"}
            </p>
            <p className="mt-1 text-sm text-[var(--primary-muted)]">
              Grant <code className="text-xs">strategies:write</code> in Staff Management,
              then create outbound, inbound, or expansion playbooks.
            </p>
            {canWrite && rows.length === 0 ? (
              <Button type="button" className="mt-4" onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create first strategy
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {filtered.map((row) => (
              <li key={row._id} className="px-5 py-4 hover:bg-[var(--background)]/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[var(--text-main)]">
                        {row.title}
                      </h2>
                      <span className="rounded bg-[var(--background)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                        {row.status}
                      </span>
                      {(row.authorizedUserIds || []).length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)]">
                          <Users className="h-3 w-3" />
                          {(row.authorizedUserIds || []).length} authorized
                        </span>
                      ) : null}
                    </div>
                    {row.summary ? (
                      <p className="mt-1 text-sm text-[var(--primary-muted)] line-clamp-2">
                        {row.summary}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(row.motionTypes || []).slice(0, 4).map((m) => (
                        <span
                          key={m}
                          className="rounded border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                        >
                          {m}
                        </span>
                      ))}
                      {(row.segments || []).slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="rounded border border-[var(--border-color)] bg-[var(--background)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    {(row.goals || []).length > 0 ? (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Goals:{" "}
                        {row.goals
                          .slice(0, 3)
                          .map((g) =>
                            g.target ? `${g.title} → ${g.target}` : g.title,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {canWrite ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => void remove(row._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit sales strategy" : "New sales strategy"}
            </DialogTitle>
          </DialogHeader>

          {!editing ? (
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = p.apply();
                    const myEmail = String(user?.email || "").toLowerCase();
                    const me = portalUsers.find(
                      (u) => String(u.email || "").toLowerCase() === myEmail,
                    );
                    setForm({
                      ...next,
                      authorizedUserIds: me?._id ? [String(me._id)] : [],
                    });
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="space-y-4 py-2">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Q3 enterprise outbound"
              />
            </div>
            <div>
              <Label>Summary</Label>
              <Input
                value={form.summary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, summary: e.target.value }))
                }
                placeholder="One-line strategy summary"
              />
            </div>
            <div>
              <Label>Objective</Label>
              <Input
                value={form.objective}
                onChange={(e) =>
                  setForm((f) => ({ ...f, objective: e.target.value }))
                }
                placeholder="What outcome should this drive?"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Status</Label>
                <select
                  className="mt-1 w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value as StrategyStatus,
                    }))
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Quota / pipeline target</Label>
                <Input
                  value={form.quotaTarget}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quotaTarget: e.target.value }))
                  }
                  placeholder="e.g. 50L pipeline"
                />
              </div>
            </div>

            <div>
              <Label>Motion types</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {MOTION_SUGGESTIONS.map((m) => (
                  <ChipToggle
                    key={m}
                    label={m}
                    active={splitCsv(form.motionTypes).some(
                      (x) => x.toLowerCase() === m.toLowerCase(),
                    )}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        motionTypes: toggleCsvToken(f.motionTypes, m),
                      }))
                    }
                  />
                ))}
              </div>
              <Input
                className="mt-2"
                value={form.motionTypes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, motionTypes: e.target.value }))
                }
                placeholder="Comma-separated"
              />
            </div>

            <div>
              <Label>Segments</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SEGMENT_SUGGESTIONS.map((m) => (
                  <ChipToggle
                    key={m}
                    label={m}
                    active={splitCsv(form.segments).some(
                      (x) => x.toLowerCase() === m.toLowerCase(),
                    )}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        segments: toggleCsvToken(f.segments, m),
                      }))
                    }
                  />
                ))}
              </div>
              <Input
                className="mt-2"
                value={form.segments}
                onChange={(e) =>
                  setForm((f) => ({ ...f, segments: e.target.value }))
                }
              />
            </div>

            <div>
              <Label>Channels</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CHANNEL_SUGGESTIONS.map((m) => (
                  <ChipToggle
                    key={m}
                    label={m}
                    active={splitCsv(form.channels).some(
                      (x) => x.toLowerCase() === m.toLowerCase(),
                    )}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        channels: toggleCsvToken(f.channels, m),
                      }))
                    }
                  />
                ))}
              </div>
              <Input
                className="mt-2"
                value={form.channels}
                onChange={(e) =>
                  setForm((f) => ({ ...f, channels: e.target.value }))
                }
              />
            </div>

            <div>
              <Label>ICP notes</Label>
              <Input
                value={form.icpNotes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, icpNotes: e.target.value }))
                }
                placeholder="Comma-separated ICP criteria"
              />
            </div>
            <div>
              <Label>Playbook steps</Label>
              <Input
                value={form.playbookSteps}
                onChange={(e) =>
                  setForm((f) => ({ ...f, playbookSteps: e.target.value }))
                }
                placeholder="Comma-separated steps"
              />
            </div>
            <div>
              <Label>Key messages</Label>
              <Input
                value={form.keyMessages}
                onChange={(e) =>
                  setForm((f) => ({ ...f, keyMessages: e.target.value }))
                }
                placeholder="Comma-separated messages"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>Tags</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="Comma-separated"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Goals</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      goals: [...f.goals, { title: "", metric: "", target: "" }],
                    }))
                  }
                >
                  Add goal
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {form.goals.map((g, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Goal"
                      value={g.title}
                      onChange={(e) => {
                        const goals = [...form.goals];
                        goals[idx] = { ...goals[idx], title: e.target.value };
                        setForm((f) => ({ ...f, goals }));
                      }}
                    />
                    <Input
                      placeholder="Metric"
                      value={g.metric || ""}
                      onChange={(e) => {
                        const goals = [...form.goals];
                        goals[idx] = { ...goals[idx], metric: e.target.value };
                        setForm((f) => ({ ...f, goals }));
                      }}
                    />
                    <div className="flex gap-1">
                      <Input
                        placeholder="Target"
                        value={g.target || ""}
                        onChange={(e) => {
                          const goals = [...form.goals];
                          goals[idx] = { ...goals[idx], target: e.target.value };
                          setForm((f) => ({ ...f, goals }));
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            goals: f.goals.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Authorized people
              </Label>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Only these CRM users (plus admins) can see this strategy. Also grant{" "}
                <code className="text-[10px]">strategies:read</code> in Staff Management.
              </p>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--border-color)] p-2">
                {portalUsers.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">Loading users…</p>
                ) : (
                  portalUsers.map((u) => {
                    const id = String(u._id);
                    const checked = form.authorizedUserIds.includes(id);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[var(--background)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setForm((f) => ({
                              ...f,
                              authorizedUserIds: checked
                                ? f.authorizedUserIds.filter((x) => x !== id)
                                : [...f.authorizedUserIds, id],
                            }));
                          }}
                        />
                        <span className="truncate">{userLabel(u)}</span>
                        {u.email ? (
                          <span className="truncate text-xs text-[var(--text-muted)]">
                            {u.email}
                          </span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-center text-xs text-[var(--text-muted)]">
        Related:{" "}
        <Link href="/crm/playbooks" className="text-[var(--hs-link)] hover:underline">
          Playbooks
        </Link>{" "}
        ·{" "}
        <Link href="/crm/outreach" className="text-[var(--hs-link)] hover:underline">
          Outreach
        </Link>
      </p>
    </div>
  );
}
