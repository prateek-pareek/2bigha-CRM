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

  const getCategoryBadge = (category?: string) => {
    const cat = String(category || '').toUpperCase();
    if (cat.includes('MARKETING')) {
      return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200 shrink-0">Marketing</span>;
    }
    if (cat.includes('UTILITY')) {
      return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-50 text-sky-600 border border-sky-200 shrink-0">Utility</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0">{category || 'Template'}</span>;
  };

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
    <div className="w-full space-y-6 animate-in fade-in duration-500 pb-10">
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
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, language, category…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto py-1 custom-scrollbar">
          {statusOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-all duration-150",
                statusFilter === s
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              )}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-16 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-400">
            <Loader2 size={16} className="animate-spin text-emerald-600" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
            <FileText className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="text-sm font-bold text-slate-700">No templates found</p>
            <p className="mt-1.5 text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Create a draft template, add custom body/variables, then submit for Meta approval.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((t) => (
              <div 
                key={t._id} 
                className="group relative flex flex-col justify-between bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-5"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/crm/whatsapp/templates/${t._id}`} className="min-w-0 flex-1 hover:underline">
                      <h3 className="text-sm font-bold text-slate-800 break-all leading-snug">{t.name}</h3>
                    </Link>
                    <span className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                      statusTone(t.status)
                    )}>
                      {t.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <span>{t.language}</span>
                    <span>•</span>
                    {getCategoryBadge(t.category)}
                    {t.source === "meta" && (
                      <span className="rounded bg-sky-50 px-1.5 py-0.5 border border-sky-100 text-sky-600 text-[9px] font-bold">Meta</span>
                    )}
                    {t.aisensyCampaignName && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 border border-emerald-100 text-emerald-600 text-[9px] font-bold truncate max-w-[160px]" title={`AiSensy: ${t.aisensyCampaignName}`}>
                        Campaign: {t.aisensyCampaignName}
                      </span>
                    )}
                  </div>

                  {/* Body Preview Bubble */}
                  <div 
                    className="p-3.5 rounded-lg border border-slate-200/40 shadow-inner min-h-[80px] flex items-start"
                    style={{
                      backgroundColor: "#e5ddd5",
                      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cg fill='none' stroke='%23c4b8a0' stroke-width='1.0' opacity='0.25'%3E%3Ccircle cx='10' cy='12' r='4'/%3E%3Cpath d='M30 8c3 3 3 8 0 11-3-3-3-8 0-11z'/%3E%3Cpath d='M50 15l4 4-4 4-4-4z'/%3E%3Ccircle cx='65' cy='45' r='3'/%3E%3C/g%3E%3C/svg%3E\")"
                    }}
                  >
                    <div 
                      className="relative w-full rounded-md px-3 py-2 text-[11px] leading-relaxed text-[#111b21] rounded-tl-none shadow-[0_0.5px_0.5px_rgba(11,20,26,0.1)] bg-white"
                    >
                      <p className="line-clamp-3 text-slate-700 whitespace-pre-wrap">{bodyText(t)}</p>
                    </div>
                  </div>

                  {t.status === "REJECTED" && t.rejectionReason && (
                    <p className="text-[11px] font-semibold text-rose-600 leading-tight">
                      Reason: {t.rejectionReason}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3.5">
                  <Link href={`/crm/whatsapp/templates/${t._id}`} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition">
                    View Details →
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {["DRAFT", "REJECTED"].includes(t.status) && t.source === "local" && (
                      <>
                        <CrmButton
                          variant="secondary"
                          disabled={busyId === t._id}
                          onClick={() => void submit(t._id)}
                          className="h-8 gap-1.5 px-3 text-xs border-slate-200"
                        >
                          <Send size={11} /> Submit
                        </CrmButton>
                        <button
                          type="button"
                          disabled={busyId === t._id}
                          onClick={() => void remove(t._id)}
                          className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 transition"
                          title="Delete draft"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
