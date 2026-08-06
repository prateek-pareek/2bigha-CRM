"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { cn } from "@/lib/utils";

type Rec = { _id: string; name: string; description?: string; appliesTo?: string };

export default function CrmPlaybookRecommendedBanner({
  relatedTo,
  relatedType,
  className,
}: {
  relatedTo: string | undefined;
  relatedType: "Deal" | "Contact" | "Lead";
  className?: string;
}) {
  const [items, setItems] = useState<Rec[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [relatedTo, relatedType]);

  useEffect(() => {
    if (!relatedTo || dismissed) {
      setItems([]);
      return;
    }
    const token = localStorage.getItem("token");
    let cancelled = false;
    fetch(
      `${CRM_API_URL}/crm/playbooks/recommendations?relatedTo=${encodeURIComponent(relatedTo)}&relatedType=${encodeURIComponent(relatedType)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [relatedTo, relatedType, dismissed]);

  if (!relatedTo || dismissed || items.length === 0) return null;

  const first = items[0];

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 rounded-md border border-[#80cdd6]/60 bg-[#e0f4f7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2 pr-6 sm:pr-0">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hs-link)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Recommended playbook
          </p>
          <p className="truncate text-sm font-semibold text-[var(--text-main)]">{first.name}</p>
          {first.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-muted)]">{first.description}</p>
          ) : null}
          {items.length > 1 ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              +{items.length - 1} more match{items.length > 2 ? "" : "es"} this record
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:pl-4">
        <Link
          href={`/crm/playbooks`}
          className="rounded-md bg-[var(--hs-link)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#007a8c]"
        >
          Open library
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-2 rounded p-1 text-[var(--text-muted)] hover:bg-white/60 sm:static"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
