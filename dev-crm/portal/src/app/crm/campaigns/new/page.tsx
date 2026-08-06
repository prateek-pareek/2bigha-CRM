"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import {
  createEmailCampaign,
  parseRecipientLines,
} from "@/lib/crm/email-campaigns";
import {
  fetchCrmSegments,
  fetchSegmentCampaignRecipients,
  type CrmSegment,
} from "@/lib/crm/segments";

type TemplateRow = { _id: string; name: string; subject: string; body: string };

export default function NewEmailCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [recipientText, setRecipientText] = useState("");
  const [prefilledRecipients, setPrefilledRecipients] = useState<
    Array<{ email: string; name?: string; module?: string; entityId?: string }>
  >([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [aiDraftPerRecipient, setAiDraftPerRecipient] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [segmentMeta, setSegmentMeta] = useState<{
    name: string;
    truncated?: boolean;
    skippedNoEmail?: number;
  } | null>(null);
  const [loadingSegment, setLoadingSegment] = useState(false);

  const loadTemplates = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/email-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void fetchCrmSegments()
      .then(setSegments)
      .catch(() => setSegments([]));
  }, []);

  const applySegmentRecipients = useCallback(
    async (id: string, segmentName?: string) => {
      if (!id) return;
      setLoadingSegment(true);
      try {
        const exported = await fetchSegmentCampaignRecipients(id);
        const rows = exported.recipients.map((r) => ({
          email: r.email,
          name: r.name,
          module: r.module,
          entityId: r.entityId,
        }));
        if (!rows.length) {
          toast.error("This segment has no members with a valid email address");
          return;
        }
        setPrefilledRecipients(rows);
        setRecipientText(
          rows.map((r) => (r.name ? `${r.name}, ${r.email}` : r.email)).join("\n"),
        );
        setSegmentId(id);
        setSegmentMeta({
          name: segmentName || exported.segmentName,
          truncated: exported.truncated,
          skippedNoEmail: exported.skippedNoEmail,
        });
        setName((prev) =>
          prev.trim()
            ? prev
            : `${segmentName || exported.segmentName} · ${rows.length} recipients`,
        );
        toast.success(`Loaded ${rows.length} recipients from segment`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load segment");
      } finally {
        setLoadingSegment(false);
      }
    },
    [],
  );

  useEffect(() => {
    const fromQuery = searchParams.get("segmentId");
    if (fromQuery) {
      setSegmentId(fromQuery);
      void applySegmentRecipients(fromQuery);
    }
  }, [searchParams, applySegmentRecipients]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("campaignDraftRecipients");
    if (!raw) return;
    try {
      const rows = JSON.parse(raw) as Array<{
        email: string;
        name?: string;
        module?: string;
        entityId?: string;
      }>;
      if (Array.isArray(rows) && rows.length) {
        setPrefilledRecipients(rows);
        setRecipientText(
          rows
            .map((r) =>
              r.name ? `${r.name}, ${r.email}` : r.email,
            )
            .join("\n"),
        );
        setName((prev) =>
          prev.trim() ? prev : `Outreach campaign · ${rows.length} recipients`,
        );
      }
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem("campaignDraftRecipients");
  }, []);

  useEffect(() => {
    if (!templateId) return;
    const t = templates.find((x) => x._id === templateId);
    if (t) {
      setSubject(t.subject || "");
      setBodyHtml(t.body || "");
    }
  }, [templateId, templates]);

  const submit = async (sendNow: boolean) => {
    const fromText = parseRecipientLines(recipientText);
    const recipients =
      prefilledRecipients.length > 0
        ? prefilledRecipients.map((p) => {
            const match = fromText.find(
              (t) => t.email.toLowerCase() === p.email.toLowerCase(),
            );
            return {
              email: p.email,
              name: match?.name || p.name,
              module: p.module,
              entityId: p.entityId,
            };
          })
        : fromText;
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!recipients.length && !segmentId) {
      toast.error("Add at least one recipient or select a segment list");
      return;
    }
    setSaving(true);
    try {
      const camp = await createEmailCampaign({
        name: name.trim(),
        description: description.trim(),
        subject,
        bodyHtml,
        templateId: templateId || undefined,
        segmentId: segmentId || undefined,
        recipients,
        scheduledAt: sendNow ? undefined : scheduledAt || undefined,
        sendNow,
        aiDraftPerRecipient,
        aiInstructions: aiInstructions.trim() || undefined,
      });
      toast.success(sendNow ? "Campaign sent" : "Campaign saved");
      router.push(`/crm/campaigns/${camp.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save campaign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-[var(--background)] p-5 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/crm/campaigns"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--hs-link)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Link>

        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">
            New email campaign
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            One email to many recipients. Use {"{{firstName}}"} and other merge
            fields, or enable AI personalization per recipient.
          </p>
        </div>

        <div className="space-y-4 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-sm">
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-main)]">
              Campaign name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-color)] px-3 text-sm"
              placeholder="Q2 agency outreach"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-main)]">
              Description (optional)
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-color)] px-3 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-main)]">
              Email template (optional)
            </span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-color)] bg-white px-3 text-sm"
            >
              <option value="">— Custom content —</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-main)]">
              Subject
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-color)] px-3 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-main)]">
              Body (HTML)
            </span>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-[var(--border-color)] px-3 py-2 font-mono text-sm"
            />
          </label>

          <div className="space-y-3 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--hs-link)]" />
              <span className="text-sm font-semibold text-[var(--text-main)]">
                Segment list
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Load all leads and contacts from a saved segment (filters or manual list).
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="flex-1 min-w-[200px] space-y-1">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  Choose segment
                </span>
                <select
                  value={segmentId}
                  onChange={(e) => {
                    setSegmentId(e.target.value);
                    if (!e.target.value) setSegmentMeta(null);
                  }}
                  className="h-10 w-full rounded-md border border-[var(--border-color)] bg-white px-3 text-sm"
                >
                  <option value="">— Manual recipients below —</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({(s.leadCount ?? 0) + (s.contactCount ?? 0)} members)
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!segmentId || loadingSegment}
                onClick={() => {
                  const seg = segments.find((s) => s.id === segmentId);
                  void applySegmentRecipients(segmentId, seg?.name);
                }}
                className="inline-flex h-10 items-center rounded-md bg-[var(--hs-link)] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loadingSegment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Load list"
                )}
              </button>
            </div>
            {segmentMeta ? (
              <p className="text-xs text-[var(--text-main)]">
                Using segment <strong>{segmentMeta.name}</strong>
                {prefilledRecipients.length > 0
                  ? ` · ${prefilledRecipients.length} recipients loaded`
                  : ""}
                {segmentMeta.skippedNoEmail
                  ? ` · ${segmentMeta.skippedNoEmail} skipped (no email)`
                  : ""}
                {segmentMeta.truncated ? " · list capped at 5,000" : ""}
                {" · "}
                <Link href={`/crm/segments/${segmentId}`} className="text-[var(--hs-link)] hover:underline">
                  View segment
                </Link>
              </p>
            ) : null}
          </div>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-main)]">
              Recipients
            </span>
            <p className="text-xs text-[var(--text-muted)]">
              One email per line, or{" "}
              <code className="rounded bg-[var(--surface-dim)] px-1">
                Name, email@company.com
              </code>
              . Loaded from a segment above, or paste manually. We link to CRM leads/contacts when the email matches.
            </p>
            <textarea
              value={recipientText}
              onChange={(e) => setRecipientText(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
              placeholder={"Jane Doe, jane@acme.com\nbob@startup.io"}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-[var(--text-main)]">
              Schedule (optional)
            </span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--border-color)] px-3 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aiDraftPerRecipient}
              onChange={(e) => setAiDraftPerRecipient(e.target.checked)}
            />
            AI personalize each email (uses connected mailboxes)
          </label>
          {aiDraftPerRecipient ? (
            <textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              rows={3}
              placeholder="Optional instructions for AI drafts…"
              className="w-full rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
            />
          ) : null}

          <div className="flex flex-wrap gap-3 border-t border-[var(--border-color)] pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit(false)}
              className="inline-flex h-10 items-center rounded-md border border-[var(--border-color)] bg-white px-4 text-sm font-semibold"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save draft"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit(true)}
              className="inline-flex h-10 items-center rounded-md bg-[var(--hs-link)] px-4 text-sm font-semibold text-white"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : scheduledAt ? (
                "Schedule"
              ) : (
                "Send now"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
