"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Megaphone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";
import WhatsAppNavTabs from "@/components/crm/whatsapp/WhatsAppNavTabs";

interface WhatsAppCampaignSummary {
  _id: string;
  name: string;
  status: string;
  templateName: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

function statusTone(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "sending":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "scheduled":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "paused":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "failed":
    case "cancelled":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

export default function WhatsAppCampaignsPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaigns, setCampaigns] = useState<WhatsAppCampaignSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        toast.error("Failed to load campaigns");
        return;
      }
      setCampaigns(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const statusOptions = ["all", "draft", "scheduled", "sending", "paused", "completed", "cancelled", "failed"];

  const empty = useMemo(() => !loading && campaigns.length === 0, [loading, campaigns]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-text-main">WhatsApp</h1>
        <p className="text-sm font-medium text-text-muted">
          Chat with contacts and manage message templates.
        </p>
      </div>

      <WhatsAppNavTabs active="campaigns" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text-main">Campaigns</h2>
          <p className="text-sm text-text-muted">
            Bulk-send an approved template to a list of leads/contacts via AiSensy.
          </p>
        </div>
        <Link href="/crm/whatsapp/campaigns/new">
          <CrmButton variant="primary" className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus size={14} /> New campaign
          </CrmButton>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
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
                "rounded-full border px-3 py-1.5 text-[11px] font-semibold capitalize whitespace-nowrap transition",
                statusFilter === s
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-border bg-white text-text-muted hover:bg-slate-50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-xs text-text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : empty ? (
          <div className="p-12 text-center">
            <Megaphone className="mx-auto mb-3 text-text-muted opacity-30" size={28} />
            <p className="text-sm font-semibold text-text-main">No campaigns yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Pick an approved template mapped to AiSensy and send it to a list of recipients.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {campaigns.map((c) => (
              <li key={c._id}>
                <Link
                  href={`/crm/whatsapp/campaigns/${c._id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text-main">{c.name}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          statusTone(c.status),
                        )}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-muted">
                      Template: {c.templateName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-text-muted">
                    <p className="font-semibold text-text-main">
                      {c.sentCount}/{c.totalRecipients} sent
                    </p>
                    {c.failedCount > 0 && <p className="text-rose-600">{c.failedCount} failed</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
