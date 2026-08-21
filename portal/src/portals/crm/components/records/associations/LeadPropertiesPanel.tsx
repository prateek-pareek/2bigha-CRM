"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchThirdPartyPropertyListings } from "@/lib/crm/property-listings/third-party-api";
import {
  formatAddress,
  formatPrice,
  statusTone,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";

/** Properties linked to this lead, with a shortcut to add a new one. */
export default function LeadPropertiesPanel({
  leadId,
  onAddClick,
  refreshKey,
}: {
  leadId: string;
  onAddClick: () => void;
  refreshKey?: number;
}) {
  const [properties, setProperties] = useState<PropertyListingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setLoading(true);
    fetchThirdPartyPropertyListings({ leadId, pageSize: 200 })
      .then((body) => {
        if (!cancelled) {
          // Marketplace listings only — PM cases live in LeadPmPanel.
          setProperties((body.data || []).filter((p) => p.listingBucket !== "pm"));
        }
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, refreshKey]);

  return (
    <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold text-text-muted">Properties</h3>
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold uppercase tracking-wide border border-border bg-surface-dim text-text-main transition-colors hover:border-primary/40"
        >
          <Plus size={14} />
          Add property
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : properties.length === 0 ? (
        <p className="text-xs text-text-muted italic">No properties linked to this lead yet.</p>
      ) : (
        <div className="space-y-2">
          {properties.map((p) => (
            <Link
              key={p._id}
              href={`/crm/property-listings/${p._id}`}
              className="crm-kanban-card group !mt-0 !p-3 flex items-center gap-2 no-underline"
              style={{ ["--crm-stage-accent" as string]: "#2f80ed" }}
            >
              <div className="crm-kanban-avatar crm-kanban-avatar--sm shrink-0" aria-hidden>
                <Building2 size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="crm-kanban-card-title truncate text-sm">{p.title}</p>
                <p className="crm-kanban-card-subtitle truncate">
                  {formatAddress(p)} · {formatPrice(p.price, p.currency)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                  statusTone(p.status),
                )}
              >
                {p.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
