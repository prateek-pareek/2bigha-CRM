"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import CrmRecordActivityComposer from "@/components/crm/inbox/CrmRecordActivityComposer";
import Timeline from "@/components/crm/inbox/Timeline";

type Props = {
  open: boolean;
  onClose: () => void;
  property: {
    _id: string;
    title?: string;
    contactName?: string;
  } | null;
  onUpdated?: () => void;
};

/** Compact "notes + activity history" popup for a property, reachable from the property list without opening the full property detail page. Mirrors LeadActivityPopup's composer/timeline stack. */
export default function PropertyActivityPopup({ open, onClose, property, onUpdated }: Props) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activityType, setActivityType] = useState("Note");
  const [newComment, setNewComment] = useState("");

  const propertyId = property?._id;

  const fetchActivities = async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const token = getCrmAuthToken();
      const res = await fetch(
        `${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(propertyId)}&relatedType=Property`,
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
    if (!open || !propertyId) return;
    void fetchActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, propertyId]);

  if (!open || !property) return null;

  const propertyName = property.title || property.contactName || "Property";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-main)]">Notes &amp; activity</h3>
            <p className="text-xs text-[var(--text-muted)]">{propertyName}</p>
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
          <CrmRecordActivityComposer
            activityType={activityType}
            setActivityType={setActivityType}
            newComment={newComment}
            setNewComment={setNewComment}
            relatedTo={propertyId as string}
            relatedType="Property"
            onActivityPosted={(data) => {
              setActivities((prev) => [data as any, ...prev]);
              setNewComment("");
              onUpdated?.();
            }}
            onMeetingScheduleClick={() => {}}
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
