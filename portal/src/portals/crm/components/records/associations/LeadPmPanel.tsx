"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchLeadSubscriptionMock,
  fetchThirdPartyPropertyListings,
} from "@/lib/crm/property-listings/third-party-api";
import {
  formatAddress,
  pmStageBadgeTone,
  type LeadSubscriptionMock,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";
import { CrmStatusBadge } from "@/components/crm/ui";

/**
 * Lead-side PM context (doc §2): subscription + PM properties with pipeline stage.
 */
export default function LeadPmPanel({
  leadId,
  refreshKey,
  onCreatePmClick,
}: {
  leadId: string;
  refreshKey?: number;
  onCreatePmClick: () => void;
}) {
  const [pmProps, setPmProps] = useState<PropertyListingRecord[]>([]);
  const [sub, setSub] = useState<LeadSubscriptionMock | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchThirdPartyPropertyListings({ leadId, listingBucket: "pm", pageSize: 50 }),
      fetchLeadSubscriptionMock(leadId),
    ])
      .then(([list, subscription]) => {
        if (cancelled) return;
        setPmProps(list.data || []);
        setSub(subscription);
      })
      .catch(() => {
        if (!cancelled) {
          setPmProps([]);
          setSub(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, refreshKey]);

  const primaryStage = pmProps[0]?.pmStage;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-text-muted">Subscription</h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : sub ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">Plan</span>
              <span className="font-semibold text-text-main">{sub.plan}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">Expires</span>
              <span className="font-medium text-text-main">
                {new Date(sub.expiryDate).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">Featured used</span>
              <span className="font-medium text-text-main">
                {sub.featuredUsed} / {sub.featuredAllowance}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">Legal verification</span>
              <span className="font-medium text-text-main">
                {sub.includesLegalVerification
                  ? `${sub.legalVerificationUsed}${
                      sub.legalVerificationAllowance == null
                        ? " / ∞"
                        : ` / ${sub.legalVerificationAllowance}`
                    }`
                  : "Not included"}
              </span>
            </div>
            {sub.invoices[0] ? (
              <div className="mt-2 rounded-md border border-border bg-surface-dim px-2.5 py-2 text-xs">
                <p className="font-semibold text-text-main">{sub.invoices[0].label}</p>
                <p className="text-text-muted">
                  ₹{sub.invoices[0].amount.toLocaleString("en-IN")} · {sub.invoices[0].status} ·{" "}
                  {new Date(sub.invoices[0].date).toLocaleDateString()}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs italic text-text-muted">
            No subscription yet — create a PM property to bind a plan.
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-text-muted">Property Management</h3>
            {primaryStage ? (
              <div className="mt-1">
                <CrmStatusBadge tone={pmStageBadgeTone(primaryStage)}>
                  {primaryStage}
                </CrmStatusBadge>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCreatePmClick}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface-dim px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-text-main transition-colors hover:border-primary/40"
          >
            <Plus size={14} />
            Create PM
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : pmProps.length === 0 ? (
          <p className="text-xs italic text-text-muted">
            No PM properties on this lead yet.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-text-muted">
              {pmProps.length} PM propert{pmProps.length === 1 ? "y" : "ies"}
            </p>
            {pmProps.map((p) => (
              <Link
                key={p._id}
                href={`/crm/property-listings/${p._id}`}
                className={cn(
                  "crm-kanban-card group !mt-0 !p-3 flex items-center gap-2 no-underline",
                )}
                style={{ ["--crm-stage-accent" as string]: "#059669" }}
              >
                <div className="crm-kanban-avatar crm-kanban-avatar--sm shrink-0" aria-hidden>
                  <ClipboardList size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="crm-kanban-card-title truncate text-sm">{p.title}</p>
                  <p className="crm-kanban-card-subtitle truncate">
                    {p.pmPlan || "—"} · {formatAddress(p)}
                  </p>
                </div>
                {p.pmStage ? (
                  <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {p.pmStage}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
