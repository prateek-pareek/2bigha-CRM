"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Megaphone, Plus, Search, X, BarChart2 } from "lucide-react";
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
  switch (status.toLowerCase()) {
    case "completed":
    case "live":
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

  // Live Campaigns State
  const [activeTab, setActiveTab] = useState<"local" | "live">("local");
  const [liveCampaigns, setLiveCampaigns] = useState<any[]>([]);
  const [selectedLive, setSelectedLive] = useState<any | null>(null);
  const [liveAnalytics, setLiveAnalytics] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      if (activeTab === "local") {
        const params = new URLSearchParams();
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (search.trim()) params.set("search", search.trim());
        const res = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          toast.error("Failed to load local campaigns");
          return;
        }
        setCampaigns(Array.isArray(data) ? data : []);
      } else {
        const res = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns/live`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("Failed to load live campaigns");
          return;
        }
        setLiveCampaigns(Array.isArray(data?.campaign) ? data.campaign : []);
      }
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, activeTab]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const loadLiveDetails = async (campaign: any) => {
    setSelectedLive(campaign);
    setLoadingDetails(true);
    const token = localStorage.getItem("token");
    try {
      const analyticsRes = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns/live/${campaign.id}/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const analyticsData = await analyticsRes.json().catch(() => ({}));
      setLiveAnalytics(analyticsData?.analytics || null);
    } catch {
      toast.error("Failed to fetch live campaign analytics");
    } finally {
      setLoadingDetails(false);
    }
  };

  const statusOptions = ["all", "draft", "scheduled", "sending", "paused", "completed", "cancelled", "failed"];

  const filteredLive = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return liveCampaigns;
    return liveCampaigns.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.message_payload?.template?.name?.toLowerCase().includes(q)
    );
  }, [liveCampaigns, search]);

  const empty = useMemo(() => {
    if (activeTab === "local") {
      return !loading && campaigns.length === 0;
    } else {
      return !loading && filteredLive.length === 0;
    }
  }, [loading, campaigns, filteredLive, activeTab]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-text-main">WhatsApp</h1>
        <p className="text-sm font-medium text-text-muted">
          Chat with contacts and manage message templates.
        </p>
      </div>

      <WhatsAppNavTabs active="campaigns" />

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("local")}
          className={cn(
            "px-5 py-3 text-xs font-bold border-b-2 -mb-[2px] transition",
            activeTab === "local"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-text-muted hover:text-text-main"
          )}
        >
          Local Campaign Runs
        </button>
        <button
          onClick={() => setActiveTab("live")}
          className={cn(
            "px-5 py-3 text-xs font-bold border-b-2 -mb-[2px] transition",
            activeTab === "live"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-text-muted hover:text-text-main"
          )}
        >
          AiSensy Dashboard Campaigns
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text-main">
            {activeTab === "local" ? "Local Outreach Runs" : "AiSensy Project Campaigns"}
          </h2>
          <p className="text-sm text-text-muted">
            {activeTab === "local"
              ? "Track status and progress of bulk-send outreach campaigns initiated from this CRM."
              : "View the campaigns configured directly in your AiSensy dashboard."}
          </p>
        </div>
        {activeTab === "local" && (
          <Link href="/crm/whatsapp/campaigns/new">
            <CrmButton variant="primary" className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus size={14} /> New campaign
            </CrmButton>
          </Link>
        )}
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
        {activeTab === "local" && (
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
        )}
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
              {activeTab === "local"
                ? "Pick an approved template mapped to AiSensy and send it to a list of recipients."
                : "No campaigns found matching your query in the AiSensy project."}
            </p>
          </div>
        ) : activeTab === "local" ? (
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
        ) : (
          <ul className="divide-y divide-border/60">
            {filteredLive.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => void loadLiveDetails(c)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
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
                      Template: {c.message_payload?.template?.name || "N/A"} · Type: {c.type}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-text-muted">
                    <p className="font-semibold text-text-main">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : "N/A"}
                    </p>
                    <p className="text-[10px]">Audience: {c.audience_size ?? 0}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Live Campaign Analytics Modal */}
      {selectedLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-md)] border border-border bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-text-main">AiSensy Campaign Details</h3>
              <button
                onClick={() => {
                  setSelectedLive(null);
                  setLiveAnalytics(null);
                }}
                className="text-text-muted hover:text-text-main"
              >
                <X size={16} />
              </button>
            </div>
            
            {loadingDetails ? (
              <div className="flex items-center justify-center py-10 gap-2 text-xs text-text-muted">
                <Loader2 size={16} className="animate-spin" /> Fetching live metrics…
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-bold text-text-muted uppercase tracking-wide block text-[10px]">Campaign Name</span>
                    <span className="text-text-main font-semibold">{selectedLive.name}</span>
                  </div>
                  <div>
                    <span className="font-bold text-text-muted uppercase tracking-wide block text-[10px]">Status</span>
                    <span className="text-text-main font-semibold capitalize">{selectedLive.status}</span>
                  </div>
                  <div>
                    <span className="font-bold text-text-muted uppercase tracking-wide block text-[10px]">Template Name</span>
                    <span className="text-text-main font-semibold">{selectedLive.message_payload?.template?.name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="font-bold text-text-muted uppercase tracking-wide block text-[10px]">Created At</span>
                    <span className="text-text-main font-semibold">
                      {selectedLive.created_at ? new Date(selectedLive.created_at).toLocaleString() : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="font-bold text-text-main mb-2">Campaign Analytics Metrics</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-border bg-slate-50 p-2.5 rounded-[var(--radius-sm)] text-center">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide block">Sent</span>
                      <span className="text-sm font-bold text-text-main">{liveAnalytics?.sent ?? 0}</span>
                    </div>
                    <div className="border border-border bg-slate-50 p-2.5 rounded-[var(--radius-sm)] text-center">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide block">Delivered</span>
                      <span className="text-sm font-bold text-emerald-600">{liveAnalytics?.delivered ?? 0}</span>
                    </div>
                    <div className="border border-border bg-slate-50 p-2.5 rounded-[var(--radius-sm)] text-center">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide block">Read</span>
                      <span className="text-sm font-bold text-blue-600">{liveAnalytics?.read ?? 0}</span>
                    </div>
                    <div className="border border-border bg-slate-50 p-2.5 rounded-[var(--radius-sm)] text-center">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide block">Clicked</span>
                      <span className="text-sm font-bold text-indigo-600">{liveAnalytics?.clicked ?? 0}</span>
                    </div>
                    <div className="border border-border bg-slate-50 p-2.5 rounded-[var(--radius-sm)] text-center">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wide block">Failed</span>
                      <span className="text-sm font-bold text-rose-600">{liveAnalytics?.failed ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
