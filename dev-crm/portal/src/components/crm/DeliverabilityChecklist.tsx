"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  ExternalLink,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/api/config";
import {
  DELIVERABILITY_CHECKLIST_CATEGORIES,
  DELIVERABILITY_CHECKLIST_ITEMS,
  DELIVERABILITY_CHECKLIST_STORAGE_KEY,
  DELIVERABILITY_CHECKLIST_TOTAL,
  detectAutoCompletedCheckIds,
  formatChecklistExport,
  itemsByCategory,
  type DeliverabilityHealthSnapshot,
} from "@/lib/crm/deliverability-checklist-data";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : "";
}

function loadCheckedState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DELIVERABILITY_CHECKLIST_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCheckedState(state: Record<string, boolean>) {
  localStorage.setItem(DELIVERABILITY_CHECKLIST_STORAGE_KEY, JSON.stringify(state));
}

type DeliverabilityChecklistProps = {
  className?: string;
};

export default function DeliverabilityChecklist({ className }: DeliverabilityChecklistProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [health, setHealth] = useState<DeliverabilityHealthSnapshot | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecked(loadCheckedState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveCheckedState(checked);
  }, [checked, hydrated]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${CRM_API_URL}/crm/settings/email-deliverability/health`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setHealth({
          domains: (data?.domains ?? []).map((d: { spf: string; dkim: string; dmarc: string }) => ({
            spf: d.spf,
            dkim: d.dkim,
            dmarc: d.dmarc,
          })),
          summary: {
            totalAccounts: Number(data?.summary?.totalAccounts ?? 0),
            enforceSendLimits: data?.summary?.enforceSendLimits === true,
          },
          compliance: data?.compliance,
        });
      } catch {
        /* optional enhancement */
      }
    };
    void load();
  }, []);

  const autoDetected = useMemo(() => detectAutoCompletedCheckIds(health), [health]);

  const doneCount = useMemo(
    () => DELIVERABILITY_CHECKLIST_ITEMS.filter((i) => checked[i.id]).length,
    [checked],
  );

  const progressPct = Math.round((doneCount / DELIVERABILITY_CHECKLIST_TOTAL) * 100);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const applyAutoDetected = () => {
    setChecked((prev) => {
      const next = { ...prev };
      for (const id of autoDetected) next[id] = true;
      return next;
    });
    toast.success(`Marked ${autoDetected.size} items detected in CRM`);
  };

  const copyExport = async (format: "text" | "markdown") => {
    const text = formatChecklistExport(checked, format);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(format === "markdown" ? "Copied as Markdown" : "Copied as plain text");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const toggleCategory = (catId: string) => {
    setCollapsed((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className={cn("space-y-5", className)}>
      <div className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--surface-dim)] bg-[#fafbfc] space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--primary-muted)]">
                Progress
              </p>
              <p className="mt-1 text-2xl font-black text-[var(--text-main)] tabular-nums">
                {doneCount}
                <span className="text-base font-semibold text-[var(--text-muted)]">
                  /{DELIVERABILITY_CHECKLIST_TOTAL} completed
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyExport("text")}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
              >
                <Copy size={13} />
                Copy as text
              </button>
              <button
                type="button"
                onClick={() => void copyExport("markdown")}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
              >
                <Copy size={13} />
                Copy as Markdown
              </button>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--surface-dim)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--hs-link)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {autoDetected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50/80 px-4 py-3">
              <Sparkles size={16} className="shrink-0 text-sky-700" />
              <p className="min-w-0 flex-1 text-xs text-sky-900 leading-snug">
                <span className="font-bold">{autoDetected.size} items</span> can be marked from CRM
                health (SPF/DKIM/DMARC, send limits, List-Unsubscribe, connected mailboxes).
              </p>
              <button
                type="button"
                onClick={applyAutoDetected}
                className="shrink-0 rounded-md bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-800"
              >
                Apply detected
              </button>
              <Link
                href="/crm/settings/email-deliverability/health"
                className="shrink-0 text-xs font-semibold text-sky-800 underline"
              >
                View health
              </Link>
            </div>
          )}
        </div>
      </div>

      {DELIVERABILITY_CHECKLIST_CATEGORIES.map((cat) => {
        const items = itemsByCategory(cat.id);
        const catDone = items.filter((i) => checked[i.id]).length;
        const isOpen = !collapsed[cat.id];

        return (
          <div
            key={cat.id}
            className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className="flex w-full items-center gap-3 px-5 py-3.5 border-b border-[var(--surface-dim)] bg-[#fafbfc] text-left hover:bg-[var(--background)] transition-colors"
            >
              <ListChecks size={16} className="shrink-0 text-[var(--hs-link)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-main)]">{cat.title}</p>
                <p className="text-[11px] text-[var(--text-muted)] leading-snug">{cat.description}</p>
              </div>
              <span className="shrink-0 rounded-md bg-white border border-[var(--border-color)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--text-main)]">
                {catDone}/{items.length}
              </span>
              <ChevronDown
                size={16}
                className={cn(
                  "shrink-0 text-[var(--text-muted)] transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen && (
              <ul className="divide-y divide-[var(--surface-dim)]">
                {items.map((item) => {
                  const isChecked = !!checked[item.id];
                  const isAuto = autoDetected.has(item.id);
                  return (
                    <li key={item.id} className="px-5 py-4">
                      <label className="flex cursor-pointer gap-3 items-start">
                        <span className="mt-0.5 shrink-0">
                          {isChecked ? (
                            <CheckCircle2 size={18} className="text-emerald-600" />
                          ) : (
                            <Circle size={18} className="text-[var(--text-muted)]" />
                          )}
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isChecked}
                          onChange={() => toggle(item.id)}
                        />
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-sm font-semibold leading-snug",
                                isChecked
                                  ? "text-[var(--text-muted)] line-through"
                                  : "text-[var(--text-main)]",
                              )}
                            >
                              {item.label}
                            </span>
                            {isAuto && !isChecked && (
                              <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-800">
                                CRM detected
                              </span>
                            )}
                          </span>
                          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                            {item.description}
                          </p>
                          <p className="text-xs text-[var(--text-main)] leading-relaxed">
                            <span className="font-semibold">Action:</span> {item.action}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {item.href && (
                              <Link
                                href={item.href}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--hs-link)] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open in CRM
                              </Link>
                            )}
                            {item.externalHref && (
                              <a
                                href={item.externalHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--hs-link)]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                External tool
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
