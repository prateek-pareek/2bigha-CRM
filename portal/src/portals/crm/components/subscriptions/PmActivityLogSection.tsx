"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { fetchPmActivity, fetchPmActivityForProperty } from "@/lib/crm/subscriptions/backend-api";
import type { PmActivityEntry } from "@/lib/crm/subscriptions/types";

export default function PmActivityLogSection({
  leadId,
  propertyListingId,
  refreshKey,
}: {
  leadId?: string;
  propertyListingId?: string;
  refreshKey?: number;
}) {
  const [entries, setEntries] = useState<PmActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = propertyListingId
      ? fetchPmActivityForProperty(propertyListingId)
      : leadId
        ? fetchPmActivity(leadId)
        : Promise.resolve([]);
    load
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, propertyListingId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading PM activity…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs italic text-text-muted">
        No PM activity logged yet. Payment, sync, and property events will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className="relative flex gap-3 pb-4 pl-1 last:pb-0"
        >
          {index < entries.length - 1 ? (
            <span className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-border" />
          ) : null}
          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-card">
            <Clock size={10} className="text-text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-text-main">{entry.title}</p>
              <span className="text-[10px] text-text-muted">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">{entry.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
