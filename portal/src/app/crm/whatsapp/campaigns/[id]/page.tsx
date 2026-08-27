"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";

interface RecipientRecord {
  waId: string;
  name?: string;
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string;
  sentAt?: string;
}

interface CampaignDetail {
  _id: string;
  name: string;
  description?: string;
  status: string;
  templateName: string;
  aisensyCampaignName: string;
  recipients: RecipientRecord[];
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  throttlePerMinute: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
}

function statusTone(status: string): string {
  switch (status) {
    case "sent":
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "sending":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "scheduled":
    case "pending":
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

export default function WhatsAppCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("Failed to load campaign");
        return;
      }
      setCampaign(data);
    } catch {
      toast.error("Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while sending so counts/statuses update live without a manual refresh.
  useEffect(() => {
    if (campaign?.status !== "sending") return;
    const interval = setInterval(() => void load(), 4000);
    return () => clearInterval(interval);
  }, [campaign?.status, load]);

  const runAction = async (action: "pause" | "resume" | "cancel") => {
    setBusy(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || `Failed to ${action} campaign`);
        return;
      }
      setCampaign(data);
      toast.success(`Campaign ${action === "resume" ? "resumed" : action + "d"}`);
    } catch {
      toast.error(`Failed to ${action} campaign`);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !campaign) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-xs text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/crm/whatsapp/campaigns"
            className="mt-0.5 rounded-full p-2 text-text-muted transition-colors hover:bg-slate-100 hover:text-text-main"
          >
            <ChevronLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-medium tracking-tight text-text-main">{campaign.name}</h1>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                  statusTone(campaign.status),
                )}
              >
                {campaign.status}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">
              {campaign.templateName} · AiSensy campaign: {campaign.aisensyCampaignName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === "sending" && (
            <CrmButton variant="secondary" disabled={busy} onClick={() => void runAction("pause")} className="h-10 gap-2 border-slate-200">
              <Pause size={14} /> Pause
            </CrmButton>
          )}
          {campaign.status === "paused" && (
            <CrmButton variant="primary" disabled={busy} onClick={() => void runAction("resume")} className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Play size={14} /> Resume
            </CrmButton>
          )}
          {["draft", "scheduled", "paused"].includes(campaign.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction("cancel")}
              className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all duration-150"
            >
              <X size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      {campaign.lastError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-inner">
          {campaign.lastError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="text-3xl font-extrabold text-slate-700 leading-none">{campaign.totalRecipients}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2.5">Recipients</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-5 text-center shadow-sm">
          <p className="text-3xl font-extrabold text-emerald-600 leading-none">{campaign.sentCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/70 mt-2.5">Sent</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-5 text-center shadow-sm">
          <p className="text-3xl font-extrabold text-rose-600 leading-none">{campaign.failedCount}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700/70 mt-2.5">Failed</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">Recipients</h2>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Recipient</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Sent at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {campaign.recipients.map((r) => (
                <tr key={r.waId}>
                  <td className="px-4 py-2">
                    <p className="font-medium text-text-main">{r.name || "—"}</p>
                    <p className="text-[11px] text-text-muted">+{r.waId}</p>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        statusTone(r.status),
                      )}
                    >
                      {r.status}
                    </span>
                    {r.status === "failed" && r.errorMessage && (
                      <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-rose-600">
                        {r.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-text-muted">
                    {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
