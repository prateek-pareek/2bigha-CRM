"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  FileCheck,
  FileText,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchBackendPropertyListingsByLead,
  retryBackendPropertyListingSync,
  type BackendPropertyListing,
} from "@/lib/crm/property-listings/backend-api";
import { formatAddress, formatPrice, statusTone } from "@/lib/crm/property-listings/types";
import { pmStageBadgeTone } from "@/lib/crm/property-management/types";
import { CrmStatusBadge } from "@/components/crm/ui";

/** Properties linked to this lead, with full PM operational details when applicable. */
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
    <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Building2 size={15} className="text-slate-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Properties & PM Cases
          </h3>
        </div>
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-md)] text-[11px] font-bold uppercase tracking-wide border border-border bg-surface-dim text-text-main transition-colors hover:border-primary/40"
        >
          <Plus size={13} />
          Add property
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-text-muted">
          <Loader2 size={14} className="animate-spin text-sky-600" />
          Loading properties…
        </div>
      ) : properties.length === 0 ? (
        <p className="text-xs text-text-muted italic py-2">No properties linked to this lead yet.</p>
      ) : (
        <div className="space-y-3">
          {properties.map((p) => {
            const isPm = p.listingBucket === "pm";
            return (
              <div
                key={p._id}
                className={cn(
                  "rounded-lg border transition-all",
                  isPm
                    ? "border-emerald-200 bg-emerald-50/20 p-3"
                    : "border-border bg-white p-3",
                )}
              >
                {/* Title & Stage Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/crm/property-listings/${p._id}`}
                      className="font-semibold text-sm text-[var(--text-main)] hover:text-emerald-700 transition-colors line-clamp-1"
                    >
                      {p.title}
                    </Link>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {isPm ? "Property Management" : formatAddress(p)} ·{" "}
                      {formatPrice(p.price, p.currency)}
                    </p>
                  </div>
                  {isPm && p.pmStage ? (
                    <CrmStatusBadge tone={pmStageBadgeTone(p.pmStage)}>
                      {p.pmStage}
                    </CrmStatusBadge>
                  ) : (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                        statusTone(p.status || "Available"),
                      )}
                    >
                      {p.status || "Available"}
                    </span>
                  )}
                </div>

                {/* PM Pipeline Operational Summary (Stages 3-6) */}
                {isPm ? (
                  <div className="mt-2.5 rounded-md border border-emerald-100 bg-white p-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <UserCheck size={12} className="text-indigo-600" /> RM:
                      </span>
                      <span className="font-medium text-slate-800">
                        {p.rmAssigneeName || "Unassigned"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Scale size={12} className="text-amber-600" /> Legal:
                      </span>
                      <span className="font-medium text-slate-800">
                        {p.legalAssigneeName || "Unassigned"}
                        {p.legalVerification?.status ? ` (${p.legalVerification.status})` : ""}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <MapPin size={12} className="text-emerald-600" /> Field Agent:
                      </span>
                      <span className="font-medium text-slate-800">
                        {p.fieldAssigneeName || "Unassigned"}
                        {p.fieldVisit?.status ? ` (${p.fieldVisit.status})` : ""}
                      </span>
                    </div>

                    {p.visitReport?.status ? (
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                        <span className="text-slate-500 flex items-center gap-1">
                          <FileCheck size={12} className="text-sky-600" /> Inspection Report:
                        </span>
                        <span className="font-semibold text-sky-800">
                          {p.visitReport.status}
                        </span>
                      </div>
                    ) : null}

                    {/* Direct CTA */}
                    <div className="pt-1.5 text-right border-t border-slate-100">
                      <Link
                        href={`/crm/property-listings/${p._id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        Open PM Pipeline & Report <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                ) : null}

                {/* Sync error retry */}
                {(p.twobighaSyncStatus === "failed" || p.twobighaSyncStatus === "unsupported") &&
                p.twobighaSyncError ? (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-900">
                    <p className="leading-snug">{p.twobighaSyncError}</p>
                    <button
                      type="button"
                      disabled={retryingId === p._id}
                      onClick={() => void retrySync(p._id)}
                      className="mt-1 inline-flex items-center gap-1 font-semibold text-amber-800 hover:underline disabled:opacity-60"
                    >
                      {retryingId === p._id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RefreshCw size={11} />
                      )}
                      Retry 2bigha sync
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
