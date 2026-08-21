"use client";

import { useEffect, useState } from "react";
import { Loader2, PhoneCall, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmButton } from "@/components/crm/ui";
import LeadIntentChips from "@/components/crm/records/forms/LeadIntentChips";

const STATUS_OPTIONS = ["Not Answered", "Completed", "Missed", "Busy", "Failed"];

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  onSuccess?: () => void;
};

/**
 * Call Activity Form ("Set Activity") — captures a call disposition (status,
 * notes, follow-up date, Lead Intent) independent of placing a live call.
 * Reachable from the leads-table action menu ("Set Activity") and as an
 * optional post-call step after CallLeadModal succeeds.
 */
export default function CallActivityFormModal({ open, onClose, leadId, leadName, onSuccess }: Props) {
  const [status, setStatus] = useState("Not Answered");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState(tomorrowIso());
  const [intents, setIntents] = useState<string[]>([]);
  const [intentFollowUpAt, setIntentFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus("Not Answered");
      setNotes("");
      setFollowUpAt(tomorrowIso());
      setIntents([]);
      setIntentFollowUpAt("");
    }
  }, [open]);

  useEffect(() => {
    // Follow-up date defaults to tomorrow whenever the call wasn't answered.
    if (status !== "Completed" && !followUpAt) setFollowUpAt(tomorrowIso());
  }, [status, followUpAt]);

  if (!open) return null;

  const submit = async () => {
    if (!leadId) return;
    setSaving(true);
    try {
      const token = getCrmAuthToken();
      const res = await fetch(`${CRM_API_URL}/crm/ivr/call-activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          leadId,
          status,
          notes: notes.trim() || undefined,
          followUpAt: followUpAt || undefined,
          intents: intents.length ? intents : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err?.message === "string" ? err.message : "Could not save call activity");
        return;
      }
      toast.success("Call activity saved");
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-[var(--crm-shadow-raised)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]">
            <PhoneCall size={15} />
            Set Activity{leadName ? ` — ${leadName}` : ""}
          </h3>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Call status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Follow-up date</label>
            <input
              type="date"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Call notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
              placeholder="What happened on this call…"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Lead Intent</label>
            <LeadIntentChips
              selected={intents}
              onChange={setIntents}
              followUpAt={intentFollowUpAt}
              onFollowUpAtChange={setIntentFollowUpAt}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <CrmButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </CrmButton>
          <CrmButton type="button" onClick={submit} disabled={saving || !leadId}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
