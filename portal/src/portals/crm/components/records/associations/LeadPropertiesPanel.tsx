"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchBackendPropertyListingsByLead,
  retryBackendPropertyListingSync,
  type BackendPropertyListing,
} from "@/lib/crm/property-listings/backend-api";
import { formatAddress, formatPrice, statusTone } from "@/lib/crm/property-listings/types";

/** Properties linked to this lead, with a shortcut to add a new one. */
export default function LeadPropertiesPanel({
  leadId,
  onAddClick,
  refreshKey,
  onRefresh,
}: {
  leadId: string;
  onAddClick: () => void;
  refreshKey?: number;
  onRefresh?: () => void;
}) {
  const [properties, setProperties] = useState<BackendPropertyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = () => {
    if (!leadId) return;
    setLoading(true);
    fetchBackendPropertyListingsByLead(leadId)
      .then((data) => setProperties(data))
      .catch(() => setProperties([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [leadId, refreshKey]);

  const retrySync = async (id: string) => {
    setRetryingId(id);
    try {
      const updated = await retryBackendPropertyListingSync(id);
      setProperties((prev) => prev.map((p) => (p._id === id ? { ...p, ...updated } : p)));
      if (updated.twobighaSyncStatus === "synced" || updated.twobighaSyncStatus === "mock") {
        toast.success(
          updated.listingBucket === "pm" && updated.userPropertyId
            ? "PM property synced to 2bigha"
            : "Property synced to 2bigha",
        );
        onRefresh?.();
      } else {
        toast.error(updated.twobighaSyncError || "2bigha sync still failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry sync failed");
    } finally {
      setRetryingId(null);
    }
  };

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
            <div key={p._id} className="space-y-1">
              <Link
                href={`/crm/property-listings/${p._id}`}
                className="crm-kanban-card group !mt-0 !p-3 flex items-center gap-2 no-underline"
                style={{ ["--crm-stage-accent" as string]: p.listingBucket === "pm" ? "#059669" : "#2f80ed" }}
              >
                <div className="crm-kanban-avatar crm-kanban-avatar--sm shrink-0" aria-hidden>
                  <Building2 size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="crm-kanban-card-title truncate text-sm">{p.title}</p>
                  <p className="crm-kanban-card-subtitle truncate">
                    {p.listingBucket === "pm" ? `PM · ${p.pmStage || "—"}` : formatAddress(p)} ·{" "}
                    {formatPrice(p.price, p.currency)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {p.listingBucket !== "pm" ? (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                        statusTone(p.status || "Available"),
                      )}
                    >
                      {p.status || "Available"}
                    </span>
                  ) : p.pmStage ? (
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {p.pmStage}
                    </span>
                  ) : null}
                  {p.twobighaSyncStatus === "synced" ? (
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      2bigha: synced
                    </span>
                  ) : p.twobighaSyncStatus === "failed" || p.twobighaSyncStatus === "unsupported" ? (
                    <span
                      className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                      title={p.twobighaSyncError}
                    >
                      2bigha: {p.twobighaSyncStatus === "unsupported" ? "manual only" : "not synced"}
                    </span>
                  ) : p.twobighaSyncStatus === "mock" ? (
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      2bigha: mock
                    </span>
                  ) : null}
                </div>
              </Link>
              {(p.twobighaSyncStatus === "failed" || p.twobighaSyncStatus === "unsupported") &&
              p.twobighaSyncError ? (
                <div className="rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-900">
                  <p className="leading-snug">{p.twobighaSyncError}</p>
                  <button
                    type="button"
                    disabled={retryingId === p._id}
                    onClick={() => void retrySync(p._id)}
                    className="mt-1.5 inline-flex items-center gap-1 font-semibold text-amber-800 hover:underline disabled:opacity-60"
                  >
                    {retryingId === p._id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Retry 2bigha sync
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
