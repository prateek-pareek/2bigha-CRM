"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PhoneCall, X } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";

type CallLogRow = {
  _id: string;
  direction: "Incoming" | "Outgoing";
  status: string;
  duration?: number;
  notes?: string;
  recordingUrl?: string;
  followUpAt?: string;
  createdAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
};

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/** Lead Action Menu → Call History: all call activity for one lead (records, recordings, follow-up notes). */
export default function CallHistoryPanel({ open, onClose, leadId, leadName }: Props) {
  const [rows, setRows] = useState<CallLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  useEffect(() => {
    if (!open || !leadId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${CRM_API_URL}/crm/ivr/call-logs?relatedTo=${leadId}&pageSize=100`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        const data = res.ok ? await res.json() : { data: [] };
        if (!cancelled) setRows(Array.isArray(data?.data) ? data.data : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, leadId, authHeaders]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-[var(--crm-shadow-raised)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-main)]">
            <PhoneCall size={15} />
            Call History{leadName ? ` — ${leadName}` : ""}
          </h3>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-[var(--text-muted)]">No calls recorded for this lead yet.</p>
        ) : (
          <ol className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((row) => (
              <li key={row._id} className="rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text-main)]">
                    {row.direction} · {row.status}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{new Date(row.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">Duration: {formatDuration(row.duration)}</div>
                {row.notes ? <p className="mt-1.5 text-sm text-[var(--text-main)]">{row.notes}</p> : null}
                {row.followUpAt ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Follow-up: {new Date(row.followUpAt).toLocaleDateString()}
                  </p>
                ) : null}
                {row.recordingUrl ? (
                  <audio controls src={row.recordingUrl} className="mt-2 w-full">
                    <track kind="captions" />
                  </audio>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
