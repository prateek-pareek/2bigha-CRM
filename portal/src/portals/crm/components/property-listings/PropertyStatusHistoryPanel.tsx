"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Cloud, History, Loader2, MessageSquarePlus, User } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { CrmStatusBadge, crmStatusToneFromLabel } from "@/components/crm/ui";
import { VisitPanelShell } from "@/components/crm/visits/visit-chrome";
import { cn } from "@/lib/utils";

export type PropertyHistoryEntry = {
  id: string;
  action: string;
  label: string;
  detail?: string;
  fromStage?: string;
  toStage?: string;
  source: "crm" | "twobigha" | "manual";
  actorName?: string;
  createdAt: string;
};

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Status & history log for one Property Management property. The property itself lives in
 * 2bigha; the CRM stores only these events (keyed by the same id the PM actions use).
 */
export default function PropertyStatusHistoryPanel({
  propertyKey,
  propertyTitle,
  currentStage,
  refreshSignal,
}: {
  propertyKey: string;
  propertyTitle?: string;
  /** Live stage from the listing (shown even before any event is recorded). */
  currentStage?: string;
  /** Any value that changes after a PM action / live sync — triggers a reload. */
  refreshSignal?: unknown;
}) {
  const { hasAccess } = usePermissions();
  const canWrite = hasAccess("property-listings:write");
  const [items, setItems] = useState<PropertyHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!propertyKey) return;
    const reqId = ++reqRef.current;
    try {
      const { data } = await api.get<PropertyHistoryEntry[]>(
        `/crm/property-listings/${encodeURIComponent(propertyKey)}/history`,
      );
      if (reqId !== reqRef.current) return;
      setItems(Array.isArray(data) ? data : []);
      setError(false);
    } catch {
      if (reqId !== reqRef.current) return;
      setError(true);
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [propertyKey]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Reload (without the skeleton) after actions / live syncs. Small delay lets the
  // live-status stage sync finish writing first.
  useEffect(() => {
    if (refreshSignal === undefined) return;
    const t = window.setTimeout(() => void load(), 600);
    return () => window.clearTimeout(t);
  }, [refreshSignal, load]);

  const saveNote = async () => {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    try {
      const { data } = await api.post<PropertyHistoryEntry[]>(
        `/crm/property-listings/${encodeURIComponent(propertyKey)}/history/note`,
        { text, propertyTitle },
      );
      if (Array.isArray(data)) setItems(data);
      setNote("");
      setShowNote(false);
      toast.success("Note added to history");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not add note");
    } finally {
      setSaving(false);
    }
  };

  const latestStage = items.find((i) => i.toStage)?.toStage;
  const stage = currentStage || latestStage;

  return (
    <VisitPanelShell
      title="Status & history"
      hint="Every Property Management action on this property, newest first."
      action={
        canWrite ? (
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[var(--hs-link)] hover:bg-[var(--surface-dim)]"
          >
            <MessageSquarePlus size={13} />
            Add note
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-[var(--text-muted)]">Current status</span>
          {stage ? (
            <CrmStatusBadge tone={crmStatusToneFromLabel(stage)}>{stage}</CrmStatusBadge>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          )}
        </div>

        {showNote ? (
          <div className="space-y-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="e.g. Owner asked to delay the visit to next week"
              className="min-h-[64px] w-full rounded-md border border-[var(--border-color)] bg-white px-2 py-1.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNote(false);
                  setNote("");
                }}
                className="h-8 rounded-md px-3 text-xs font-semibold text-[var(--text-muted)] hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !note.trim()}
                onClick={() => void saveNote()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--hs-link)] px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                Save note
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" /> Loading history…
          </div>
        ) : error && items.length === 0 ? (
          <p className="py-3 text-xs text-rose-600">Could not load history.</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <History size={22} className="text-[var(--text-muted)] opacity-50" />
            <p className="text-xs text-[var(--text-muted)]">
              No history yet. Status changes and PM actions on this property will appear here.
            </p>
          </div>
        ) : (
          <ol className="relative max-h-[420px] space-y-0 overflow-y-auto pr-1">
            {items.map((item, idx) => {
              const stageChanged = item.toStage && item.fromStage !== item.toStage;
              const isExternal = item.source === "twobigha";
              return (
                <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {idx < items.length - 1 ? (
                    <span
                      className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-[var(--border-color)]"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                      isExternal
                        ? "border-sky-200 bg-sky-50 text-sky-600"
                        : item.source === "manual"
                          ? "border-amber-200 bg-amber-50 text-amber-600"
                          : "border-[var(--border-color)] bg-white text-[var(--text-muted)]",
                    )}
                    title={isExternal ? "Detected from 2bigha" : item.source === "manual" ? "Note" : "CRM action"}
                  >
                    {isExternal ? <Cloud size={12} /> : item.source === "manual" ? <MessageSquarePlus size={12} /> : <User size={12} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--text-main)]">{item.label}</p>
                    {stageChanged ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {item.fromStage ? (
                          <>
                            <CrmStatusBadge tone={crmStatusToneFromLabel(item.fromStage)}>
                              {item.fromStage}
                            </CrmStatusBadge>
                            <ArrowRight size={12} className="text-[var(--text-muted)]" />
                          </>
                        ) : null}
                        <CrmStatusBadge tone={crmStatusToneFromLabel(item.toStage!)}>
                          {item.toStage}
                        </CrmStatusBadge>
                      </div>
                    ) : null}
                    {item.detail ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[var(--text-muted)]">
                        {item.detail}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {item.actorName || (isExternal ? "2bigha" : "System")} · {formatAt(item.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </VisitPanelShell>
  );
}
