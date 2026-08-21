"use client";

import { useCallback, useEffect, useState } from "react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { cn } from "@/lib/utils";

type IntentOption = { _id: string; label: string; sortOrder?: number };

/** Fallback shown before the admin-configurable list loads (or if it's empty) — the FRD's default six. */
const FALLBACK_INTENTS = ["Buyer", "Seller", "Subscription", "Farm", "Property Management", "Investor"];

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  followUpAt?: string;
  onFollowUpAtChange?: (next: string) => void;
};

/**
 * Toggle-chip row for Lead Intent — potential future opportunities (client may
 * later become a Buyer/Seller/Investor, buy a Subscription, or list a
 * Property/Farm). Shared by the Add Lead form and the Call Activity Form.
 * Options come from the admin-configurable `leadIntent` picklist (Settings >
 * Lead Type, Group & Checklist), same pattern as the onboarding checklist.
 */
export default function LeadIntentChips({ selected, onChange, followUpAt, onFollowUpAtChange }: Props) {
  const [options, setOptions] = useState<IntentOption[]>([]);

  const authHeaders = useCallback(() => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=leadIntent`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        const data = res.ok ? await res.json() : [];
        if (!cancelled) setOptions(Array.isArray(data) && data.length ? data : []);
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders]);

  const labels = options.length ? options.map((o) => o.label) : FALLBACK_INTENTS;

  const toggle = (label: string) => {
    onChange(selected.includes(label) ? selected.filter((l) => l !== label) : [...selected, label]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {labels.map((label) => {
          const active = selected.includes(label);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--primary)]/50",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && onFollowUpAtChange ? (
        <div className="flex items-center gap-2 pt-1">
          <label className="text-xs font-medium text-[var(--text-muted)]">Follow up on</label>
          <input
            type="date"
            value={followUpAt ?? ""}
            onChange={(e) => onFollowUpAtChange(e.target.value)}
            className="h-8 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          No intent types selected. Toggle one above to record intent details.
        </p>
      )}
    </div>
  );
}
