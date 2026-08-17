"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";
import WhatsAppNavTabs from "@/components/crm/whatsapp/WhatsAppNavTabs";
import type { WhatsAppTemplateRecord } from "@/components/crm/whatsapp/types";

function statusTone(status: string): string {
  const s = status.toUpperCase();
  if (s === "APPROVED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "PENDING" || s === "SUBMITTED" || s === "IN_APPEAL")
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "REJECTED" || s === "DISABLED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "DRAFT") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

function bodyText(template: WhatsAppTemplateRecord): string {
  const body = (template.components || []).find(
    (c) => String(c.type || "").toUpperCase() === "BODY",
  );
  return body?.text || "—";
}

export default function WhatsAppTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templates, setTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: WhatsAppTemplateRecord[] | { message?: string } = await res
        .json()
        .catch(() => []);
      if (!res.ok) {
        toast.error((data as { message?: string })?.message || "Failed to load templates");
        return;
      }
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        toast.error(data?.error || "Sync failed");
        return;
      }
      toast.success(`Synced ${data.synced ?? 0} template status${data.synced === 1 ? "" : "es"}`);
      await load();
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const submit = async (id: string) => {
    setBusyId(id);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/${id}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to submit template");
        return;
      }
      toast.success("Submitted to Meta for approval");
      await load();
    } catch {
      toast.error("Failed to submit template");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this draft template?")) return;
    setBusyId(id);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to delete template");
        return;
      }
      toast.success("Template deleted");
      setTemplates((prev) => prev.filter((t) => t._id !== id));
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [templates, search, statusFilter]);

  const statusOptions = ["all", "DRAFT", "SUBMITTED", "PENDING", "APPROVED", "REJECTED", "DISABLED", "PAUSED"];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-text-main">WhatsApp</h1>
        <p className="text-sm font-medium text-text-muted">
          Chat with contacts and manage message templates.
        </p>
      </div>

      <WhatsAppNavTabs active="templates" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text-main">Templates</h2>
          <p className="text-sm text-text-muted">
            Draft new templates here, submit them to Meta for approval, and track status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CrmButton variant="secondary" disabled={syncing} onClick={() => void sync()} className="h-10 gap-2">
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync status
          </CrmButton>
          <Link href="/crm/whatsapp/templates/new">
            <CrmButton variant="primary" className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus size={14} /> New template
            </CrmButton>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, language, category…"
            className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {statusOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition",
                statusFilter === s
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-border bg-white text-text-muted hover:bg-slate-50",
              )}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-xs text-text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto mb-3 text-text-muted opacity-30" size={28} />
            <p className="text-sm font-semibold text-text-main">No templates yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Create a draft, fill in the body and variables, then submit for Meta approval.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((t) => (
              <li key={t._id} className="flex items-start justify-between gap-3 px-4 py-3.5">
                <Link href={`/crm/whatsapp/templates/${t._id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-text-main">{t.name}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        statusTone(t.status),
                      )}
                    >
                      {t.status}
                    </span>
                    {t.source === "meta" && (
                      <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                        From Meta
                      </span>
                    )}
                    {t.aisensyCampaignName && (
                      <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        AiSensy: {t.aisensyCampaignName}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {t.language} · {t.category}
                  </p>
                  <p className="mt-1 truncate text-xs text-text-muted">{bodyText(t)}</p>
                  {t.status === "REJECTED" && t.rejectionReason && (
                    <p className="mt-1 text-xs font-medium text-rose-600">
                      Rejected: {t.rejectionReason}
                    </p>
                  )}
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  {["DRAFT", "REJECTED"].includes(t.status) && t.source === "local" && (
                    <>
                      <CrmButton
                        variant="secondary"
                        disabled={busyId === t._id}
                        onClick={() => void submit(t._id)}
                        className="h-8 gap-1.5 px-3 text-xs"
                      >
                        <Send size={12} /> Submit
                      </CrmButton>
                      <button
                        type="button"
                        disabled={busyId === t._id}
                        onClick={() => void remove(t._id)}
                        className="rounded-full p-2 text-text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        title="Delete draft"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
