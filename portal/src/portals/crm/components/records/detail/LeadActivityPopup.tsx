"use client";

import { useEffect, useState } from "react";
import { X, Clock } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmButton } from "@/components/crm/ui";
import CrmRecordActivityComposer from "@/components/crm/inbox/CrmRecordActivityComposer";
import Timeline from "@/components/crm/inbox/Timeline";

type Props = {
  open: boolean;
  onClose: () => void;
  lead: {
    _id: string;
    firstName?: string;
    lastName?: string;
    nextFollowUpAt?: string | null;
  } | null;
  onUpdated?: () => void;
};

/** Compact "call notes + follow-up + activity history" popup, reachable from the Leads list without opening the full lead detail page. Reuses the same composer/timeline/notification stack the lead detail page uses. */
export default function LeadActivityPopup({ open, onClose, lead, onUpdated }: Props) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activityType, setActivityType] = useState("Call");
  const [newComment, setNewComment] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const leadId = lead?._id;

  const fetchActivities = async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const token = getCrmAuthToken();
      const res = await fetch(
        `${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(leadId)}&relatedType=Lead`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setActivities(Array.isArray(data) ? data : data?.items || []);
      }
    } catch {
      // Timeline just renders empty on failure — non-fatal for a quick-notes popup.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !leadId) return;
    setFollowUpAt(lead?.nextFollowUpAt ? String(lead.nextFollowUpAt).slice(0, 16) : "");
    void fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId]);

  if (!open || !lead) return null;

  const leadName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead";

  const saveFollowUp = async () => {
    setSavingFollowUp(true);
    try {
      const token = getCrmAuthToken();
      const res = await fetch(`${CRM_API_URL}/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nextFollowUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save follow-up");
      toast.success("Follow-up updated");
      onUpdated?.();
    } catch {
      toast.error("Could not update follow-up");
    } finally {
      setSavingFollowUp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-main)]">Notes &amp; follow-up</h3>
            <p className="text-xs text-[var(--text-muted)]">{leadName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex items-end gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-3">
            <div className="flex-1">
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                <Clock size={12} /> Next follow-up
              </label>
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                className="h-9 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-2 text-sm outline-none focus:border-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)]/10"
              />
            </div>
            <CrmButton type="button" disabled={savingFollowUp} onClick={saveFollowUp}>
              {savingFollowUp ? "Saving…" : "Save"}
            </CrmButton>
          </div>

          <CrmRecordActivityComposer
            activityType={activityType}
            setActivityType={setActivityType}
            newComment={newComment}
            setNewComment={setNewComment}
            relatedTo={leadId as string}
            relatedType="Lead"
            onActivityPosted={(data) => {
              setActivities((prev) => [data as any, ...prev]);
              setNewComment("");
            }}
            onMeetingScheduleClick={() => {
              toast.info("Open the full lead page to schedule a meeting");
            }}
            lead={lead}
          />

          {loading ? (
            <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading activity…</p>
          ) : (
            <Timeline activities={activities} filterType="Activity" onRefreshNeeded={fetchActivities} />
          )}
        </div>
      </div>
    </div>
  );
}
