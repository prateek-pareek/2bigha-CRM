"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ListChecks, Loader2 } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ChecklistOption = { _id: string; label: string; sortOrder?: number };

type Props = {
  leadId: string;
  /** Current lead.checklistProgress — { [itemLabel]: boolean } */
  progress?: Record<string, boolean> | null;
  onUpdated?: () => void;
};

/**
 * Onboarding checklist shown on the Lead detail page only. Items are managed in
 * Settings > Lead Type, Group & Checklist (admin-configurable, same pattern as
 * the Lead Type / Group picklists).
 */
export default function LeadOnboardingChecklistCard({ leadId, progress, onUpdated }: Props) {
  const [items, setItems] = useState<ChecklistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLabel, setSavingLabel] = useState<string | null>(null);

  const authHeaders = useCallback(() => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=checklistItem`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        const data = res.ok ? await res.json() : [];
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const toggle = async (label: string, currentlyDone: boolean) => {
    setSavingLabel(label);
    try {
      const nextProgress = { ...(progress || {}), [label]: !currentlyDone };
      const res = await fetch(`${CRM_API_URL}/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ checklistProgress: nextProgress }),
      });
      if (!res.ok) {
        toast.error("Could not update checklist");
        return;
      }
      onUpdated?.();
    } catch {
      toast.error("Network error");
    } finally {
      setSavingLabel(null);
    }
  };

  if (!loading && items.length === 0) return null;

  const doneCount = items.filter((i) => progress?.[i.label]).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--crm-shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
          <ListChecks size={13} aria-hidden />
          Onboarding Checklist
        </h3>
        {items.length > 0 && (
          <span className="shrink-0 rounded-md bg-[var(--surface-dim)] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-text-muted">
            {doneCount}/{items.length}
          </span>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-3 text-text-muted">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : (
        <ul className="space-y-2">
          {items
            .slice()
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((item) => {
              const done = !!progress?.[item.label];
              const saving = savingLabel === item.label;
              return (
                <li key={item._id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void toggle(item.label, done)}
                    className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--background)] disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[4px] border-2 transition-all",
                        done ? "border-primary bg-primary text-white" : "border-[var(--border-color)] bg-white",
                      )}
                    >
                      {saving ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : done ? (
                        <Check size={10} strokeWidth={3.5} />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-medium",
                        done ? "text-text-muted line-through" : "text-text-primary",
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
