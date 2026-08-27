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
    <div className="w-full space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-text-main">WhatsApp</h1>
        <p className="text-sm font-medium text-text-muted">
          Chat with contacts and manage message templates.
        </p>
      </div>

      <WhatsAppNavTabs active="campaigns" />

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1.5 rounded-xl gap-1 max-w-md border border-slate-200/50 shadow-inner">
        <button
          onClick={() => setActiveTab("local")}
          className={cn(
            "flex-1 px-4 py-2.5 text-xs font-bold rounded-lg transition-all duration-150",
            activeTab === "local"
              ? "bg-white text-emerald-700 shadow-sm border border-slate-200/40"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50"
          )}
        >
          Local Campaign Runs
        </button>
        <button
          onClick={() => setActiveTab("live")}
          className={cn(
            "flex-1 px-4 py-2.5 text-xs font-bold rounded-lg transition-all duration-150",
            activeTab === "live"
              ? "bg-white text-emerald-700 shadow-sm border border-slate-200/40"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50"
          )}
        >
          AiSensy Dashboard Campaigns
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            {activeTab === "local" ? "Local Outreach Runs" : "AiSensy Project Campaigns"}
          </h2>
          <p className="text-xs font-medium text-slate-400 mt-0.5">
            {activeTab === "local"
              ? "Track status and progress of bulk-send outreach campaigns initiated from this CRM."
              : "View the campaigns configured directly in your AiSensy dashboard."}
          </p>
        </div>
        {activeTab === "local" && (
          <Link href="/crm/whatsapp/campaigns/new">
            <CrmButton variant="primary" className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700 font-semibold shadow-sm hover:shadow">
              <Plus size={14} /> New campaign
            </CrmButton>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
          />
        </div>
        {activeTab === "local" && (
          <div className="flex items-center gap-1 overflow-x-auto py-1 custom-scrollbar">
            {statusOptions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[11px] font-semibold capitalize whitespace-nowrap transition-all duration-150",
                  statusFilter === s
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-16 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-400">
            <Loader2 size={16} className="animate-spin text-emerald-600" /> Loading…
          </div>
        ) : empty ? (
          <div className="p-16 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
            <Megaphone className="mx-auto mb-3 text-slate-300 animate-pulse" size={36} />
            <p className="text-sm font-bold text-slate-700">No campaigns found</p>
            <p className="mt-1.5 text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              {activeTab === "local"
                ? "Pick an approved template mapped to AiSensy and send it to a list of recipients."
                : "No campaigns found matching your query in the AiSensy project."}
            </p>
          </div>
        ) : activeTab === "local" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {campaigns.map((c) => {
              const progress = c.totalRecipients > 0 ? (c.sentCount / c.totalRecipients) * 100 : 0;
              return (
                <div 
                  key={c._id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-5 flex flex-col justify-between"
                >
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/crm/whatsapp/campaigns/${c._id}`} className="min-w-0 flex-1 hover:underline">
                        <h3 className="text-sm font-bold text-slate-800 break-all leading-snug">{c.name}</h3>
                      </Link>
                      <span className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                        statusTone(c.status)
                      )}>
                        {c.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-medium">
                      Template: <span className="font-semibold text-slate-700">{c.templateName}</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>PROGRESS</span>
                        <span>{c.sentCount}/{c.totalRecipients} ({progress.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/40">
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {c.failedCount > 0 && (
                      <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1 leading-none mt-1">
                        ⚠️ {c.failedCount} messages failed to deliver
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3.5">
                    <Link href={`/crm/whatsapp/campaigns/${c._id}`} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition">
                      View Report →
                    </Link>
                    <span className="text-[10px] font-semibold text-slate-400">
                      Updated {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredLive.map((c) => (
              <div 
                key={c.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-5 flex flex-col justify-between"
              >
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => void loadLiveDetails(c)} className="min-w-0 flex-1 hover:underline text-left">
                      <h3 className="text-sm font-bold text-slate-800 break-all leading-snug">{c.name}</h3>
                    </button>
                    <span className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                      statusTone(c.status)
                    )}>
                      {c.status}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-medium">
                    Template: <span className="font-semibold text-slate-700">{c.message_payload?.template?.name || "N/A"}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50 shadow-inner">
                    <span>AUDIENCE SIZE</span>
                    <span className="text-xs text-slate-800 font-extrabold">{c.audience_size ?? 0}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3.5">
                  <button 
                    onClick={() => void loadLiveDetails(c)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition flex items-center gap-1.5"
                  >
                    <BarChart2 size={13} /> View Analytics
                  </button>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : "N/A"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Campaign Analytics Modal */}
      {selectedLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">AiSensy Campaign Details</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Live project performance metrics</p>
              </div>
              <button
                onClick={() => {
                  setSelectedLive(null);
                  setLiveAnalytics(null);
                }}
                className="rounded-full p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 transition"
              >
                <X size={16} />
              </button>
            </div>
            
            {loadingDetails ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-xs text-slate-400">
                <Loader2 size={18} className="animate-spin text-emerald-600" /> Fetching live metrics…
              </div>
            ) : (
              <div className="space-y-5 text-xs">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50 shadow-inner">
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Campaign Name</span>
                    <span className="text-slate-800 font-bold text-xs leading-relaxed">{selectedLive.name}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Status</span>
                    <span className={cn(
                      "inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider mt-0.5",
                      statusTone(selectedLive.status)
                    )}>{selectedLive.status}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px] mt-1">Template Name</span>
                    <span className="text-slate-800 font-semibold">{selectedLive.message_payload?.template?.name || "N/A"}</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px] mt-1">Created At</span>
                    <span className="text-slate-800 font-semibold">
                      {selectedLive.created_at ? new Date(selectedLive.created_at).toLocaleString() : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="font-bold text-slate-700 mb-3 text-xs flex items-center gap-1.5">
                    <BarChart2 size={14} className="text-emerald-600" /> Campaign Analytics Metrics
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-slate-200/80 bg-white p-3 rounded-xl text-center shadow-sm">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Sent</span>
                      <span className="text-sm font-extrabold text-slate-700 mt-1 block">{liveAnalytics?.sent ?? 0}</span>
                    </div>
                    <div className="border border-emerald-100 bg-emerald-50/20 p-3 rounded-xl text-center shadow-sm">
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">Delivered</span>
                      <span className="text-sm font-extrabold text-emerald-600 mt-1 block">{liveAnalytics?.delivered ?? 0}</span>
                    </div>
                    <div className="border border-blue-100 bg-blue-50/20 p-3 rounded-xl text-center shadow-sm">
                      <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider block">Read</span>
                      <span className="text-sm font-extrabold text-blue-600 mt-1 block">{liveAnalytics?.read ?? 0}</span>
                    </div>
                    <div className="border border-indigo-100 bg-indigo-50/20 p-3 rounded-xl text-center shadow-sm">
                      <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider block">Clicked</span>
                      <span className="text-sm font-extrabold text-indigo-600 mt-1 block">{liveAnalytics?.clicked ?? 0}</span>
                    </div>
                    <div className="border border-rose-100 bg-rose-50/20 p-3 rounded-xl text-center shadow-sm">
                      <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider block">Failed</span>
                      <span className="text-sm font-extrabold text-rose-600 mt-1 block">{liveAnalytics?.failed ?? 0}</span>
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
