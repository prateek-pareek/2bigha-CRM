"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  CAMPAIGN_STATUS_LABEL,
  cancelEmailCampaign,
  fetchEmailCampaign,
  sendEmailCampaignNow,
  type EmailCampaign,
} from "@/lib/crm/email-campaigns";
import { cn } from "@/lib/utils";

export default function EmailCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setCampaign(await fetchEmailCampaign(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    if (campaign?.status === "sending") {
      const t = setInterval(() => void load(), 5000);
      return () => clearInterval(t);
    }
  }, [load, campaign?.status]);

  const handleSend = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const updated = await sendEmailCampaignNow(id);
      setCampaign(updated);
      toast.success("Campaign sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setBusy(true);
    try {
      setCampaign(await cancelEmailCampaign(id));
      toast.success("Schedule cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--hs-link)]" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center text-sm text-[var(--text-muted)]">
        Campaign not found.{" "}
        <Link href="/crm/campaigns" className="text-[var(--hs-link)]">
          Back to list
        </Link>
      </div>
    );
  }

  const canSend = ["draft", "scheduled", "failed"].includes(campaign.status);

  return (
    <div className="min-h-full bg-[var(--background)] p-5 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/crm/campaigns"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--hs-link)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-main)]">
              {campaign.name}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {CAMPAIGN_STATUS_LABEL[campaign.status]}
              {campaign.scheduledAt && campaign.status === "scheduled"
                ? ` · ${new Date(campaign.scheduledAt).toLocaleString()}`
                : ""}
            </p>
            {campaign.lastError ? (
              <p className="mt-2 text-sm text-rose-700">{campaign.lastError}</p>
            ) : null}
            {campaign.segmentId ? (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Audience from{" "}
                <Link
                  href={`/crm/segments/${campaign.segmentId}`}
                  className="font-medium text-[var(--hs-link)] hover:underline"
                >
                  segment list
                </Link>
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {canSend ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSend()}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--hs-link)] px-4 text-sm font-semibold text-white"
              >
                <Send className="h-4 w-4" />
                Send now
              </button>
            ) : null}
            {campaign.status === "scheduled" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCancel()}
                className="inline-flex h-10 items-center rounded-md border border-[var(--border-color)] bg-white px-4 text-sm font-semibold"
              >
                Cancel schedule
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-[var(--border-color)] bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
              Recipients
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {campaign.totalRecipients}
            </p>
          </div>
          <div className="rounded-md border border-[var(--border-color)] bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
              Sent
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
              {campaign.sentCount}
            </p>
          </div>
          <div className="rounded-md border border-[var(--border-color)] bg-white p-4">
            <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">
              Failed
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-700">
              {campaign.failedCount}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-[var(--border-color)] bg-white p-4 space-y-2">
          <p className="text-sm font-semibold text-[var(--text-main)]">Subject</p>
          <p className="text-sm text-[var(--text-muted)]">{campaign.subject}</p>
          <p className="text-sm font-semibold text-[var(--text-main)] pt-2">
            Preview
          </p>
          <div
            className="prose prose-sm max-w-none rounded-md border border-[var(--border-color)] bg-[var(--background)] p-4"
            dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }}
          />
        </div>

        <div className="rounded-md border border-[var(--border-color)] bg-white overflow-hidden">
          <div className="border-b border-[var(--border-color)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-main)]">
              Recipients
            </h2>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface-dim)] text-left text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">CRM</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {campaign.recipients.map((r) => (
                  <tr key={r.email}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{r.email}</span>
                      {r.name ? (
                        <span className="block text-xs text-[var(--text-muted)]">
                          {r.name}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--text-muted)]">
                      {r.entityId && r.module ? (
                        <Link
                          href={`/crm/${r.module}/${r.entityId}`}
                          className="text-[var(--hs-link)]"
                        >
                          {r.module}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "text-xs font-semibold capitalize",
                          r.status === "sent"
                            ? "text-emerald-700"
                            : r.status === "failed"
                              ? "text-rose-700"
                              : "text-[var(--text-muted)]",
                        )}
                      >
                        {r.status}
                      </span>
                      {r.errorMessage ? (
                        <span className="block text-xs text-rose-600">
                          {r.errorMessage}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
