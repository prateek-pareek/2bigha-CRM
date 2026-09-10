"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, Plus, ArrowUpCircle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLeadPmOverview } from "../../../lib/subscriptions/backend-api";
import type { LeadPmOverview, LeadPmPropertyOverview } from "../../../lib/subscriptions/types";
import PmPaymentHistorySection from "../../subscriptions/PmPaymentHistorySection";
import PmActivityLogSection from "../../subscriptions/PmActivityLogSection";
import UpgradePlanModal from "../../subscriptions/UpgradePlanModal";
import CancelPlanModal from "../../subscriptions/CancelPlanModal";
import { pmStageBadgeTone } from "@/lib/crm/property-management/types";
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
  const [overview, setOverview] = useState<LeadPmOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentRefresh, setPaymentRefresh] = useState(0);
  const [targetUserPropId, setTargetUserPropId] = useState<string | null>(null);
  const [targetPlanName, setTargetPlanName] = useState<string | undefined>(undefined);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const loadOverview = () => {
    if (!leadId) return;
    setLoading(true);
    fetchLeadPmOverview(leadId)
      .then((data) => setOverview(data))
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!leadId) return;
    loadOverview();
  }, [leadId, refreshKey, paymentRefresh]);

  const unboundSubs = overview?.unboundSubscriptions || [];
  const activeSubscriptions = overview?.activeSubscriptions || [];
  const activePlans = overview?.activePlans || [];
  const paymentHistory = overview?.paymentHistory || [];
  const pmProps = overview?.properties || [];
  const combinedStatus = overview?.combinedStatus;
  const primaryStage = pmProps[0]?.pmStage;

  const boundSubscriptions = activePlans.length > 0
    ? activePlans.map((p) => ({
        id: p.userPropertyId,
        planName: p.planName,
        billingCycle: p.billingCycle,
        status: p.status,
        propertyTitle: pmProps.find((prop) => prop.userPropertyId === p.userPropertyId)?.title,
        startDate: p.startDate,
        endDate: p.endDate,
      }))
    : activeSubscriptions.filter((s) => s.status === "ACTIVE" && (s.propertyTitle || s.userPropertyId));

  const hasBoundSubscription =
    boundSubscriptions.length > 0 ||
    pmProps.some((p) => p.subscriptionStatus === "ACTIVE" && p.userPropertyId);

  const hasSuccessfulPayment = paymentHistory.some((p) => p.status === "SUCCESS");
  const needsPayment = !unboundSubs.length && !hasBoundSubscription && !hasSuccessfulPayment;

  return (
    <div className="space-y-4">
      {combinedStatus ? (
        <div className="rounded-[var(--crm-radius-ui)] border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-900">
          <span className="font-semibold">PM status:</span> {combinedStatus}
        </div>
      ) : null}

      <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-text-muted">Subscription</h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : unboundSubs.length > 0 ? (
          <div className="space-y-3">
            <p className="text-[11px] text-emerald-800 font-medium">
              Unbound credit available — create or sync a PM property to bind it.
            </p>
            {unboundSubs.map((sub) => (
              <div
                key={sub.subscriptionId}
                className="space-y-1.5 text-sm rounded-md border border-border bg-surface-dim px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-text-main">{sub.planName}</span>
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    ACTIVE · unbound
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-text-muted">Purchased</span>
                  <span className="font-medium text-text-main">
                    {new Date(sub.purchasedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-text-muted">Price Paid</span>
                  <span className="font-medium text-text-main">₹{sub.price.toLocaleString("en-IN")}</span>
                </div>
              </div>
            ))}
          </div>
        ) : hasBoundSubscription ? (
          <div className="space-y-3">
            <p className="text-xs text-emerald-800">
              PM subscription is <strong>active and bound</strong> to a property — no further payment needed for this cycle.
            </p>
            {boundSubscriptions.map((sub) => (
              <div
                key={String(sub.id)}
                className="space-y-1.5 text-sm rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-text-main">{sub.planName}</span>
                  <CrmStatusBadge tone="success">{sub.status}</CrmStatusBadge>
                </div>
                {"billingCycle" in sub && sub.billingCycle ? (
                  <p className="text-xs text-text-muted">{sub.billingCycle}</p>
                ) : null}
                {"propertyTitle" in sub && sub.propertyTitle ? (
                  <p className="text-xs text-emerald-800">Property: {sub.propertyTitle}</p>
                ) : null}
                {"startDate" in sub && sub.startDate ? (
                  <p className="text-[11px] text-text-muted">
                    {new Date(sub.startDate).toLocaleDateString()}
                    {"endDate" in sub && sub.endDate
                      ? ` → ${new Date(sub.endDate).toLocaleDateString()}`
                      : ""}
                  </p>
                ) : null}
                {sub.status === "ACTIVE" && (
                  <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/80 mt-1.5">
                    <button
                      onClick={() => {
                        setTargetUserPropId(String(sub.id));
                        setTargetPlanName(sub.planName);
                        setUpgradeOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded transition-colors"
                    >
                      <ArrowUpCircle size={12} /> Upgrade Plan
                    </button>
                    <button
                      onClick={() => {
                        setTargetUserPropId(String(sub.id));
                        setTargetPlanName(sub.planName);
                        setCancelOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded transition-colors"
                    >
                      <AlertOctagon size={12} /> Cancel Plan
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs italic text-text-muted">
              No active PM subscription logged for this lead.
            </p>
            {hasSuccessfulPayment ? (
              <p className="text-xs text-amber-800 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                Payment recorded — sync or create the PM property to bind the subscription.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
        <h3 className="mb-3 text-xs font-bold text-text-muted">Payment history</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <PmPaymentHistorySection payments={paymentHistory} compact />
        )}
      </div>

      <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
        <h3 className="mb-3 text-xs font-bold text-text-muted">PM activity log</h3>
        <PmActivityLogSection leadId={leadId} refreshKey={paymentRefresh + (refreshKey || 0)} />
      </div>

      <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-text-muted">Property Management</h3>
            {primaryStage ? (
              <div className="mt-1">
                <CrmStatusBadge tone={pmStageBadgeTone(primaryStage)}>{primaryStage}</CrmStatusBadge>
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
          <p className="text-xs italic text-text-muted">No PM properties on this lead yet.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-text-muted">
              {pmProps.length} PM propert{pmProps.length === 1 ? "y" : "ies"}
            </p>
            {pmProps.map((p) => (
              <PmPropertyRow key={p.id} property={p} />
            ))}
          </div>
        )}
      </div>

      {upgradeOpen && targetUserPropId && (
        <UpgradePlanModal
          isOpen={upgradeOpen}
          onClose={() => {
            setUpgradeOpen(false);
            setTargetUserPropId(null);
          }}
          leadId={leadId}
          userPropertyId={targetUserPropId}
          currentPlanName={targetPlanName}
          onSuccess={loadOverview}
        />
      )}

      {cancelOpen && targetUserPropId && (
        <CancelPlanModal
          isOpen={cancelOpen}
          onClose={() => {
            setCancelOpen(false);
            setTargetUserPropId(null);
          }}
          leadId={leadId}
          userPropertyId={targetUserPropId}
          planName={targetPlanName}
          onSuccess={loadOverview}
        />
      )}
    </div>
  );
}

function PmPropertyRow({ property }: { property: LeadPmPropertyOverview }) {
  const subtitle = [
    property.subscriptionStatus ? `Sub: ${property.subscriptionStatus}` : null,
    property.rmName ? `RM: ${property.rmName}` : null,
    property.legalName ? `Legal: ${property.legalName}` : null,
    property.fieldName ? `Field: ${property.fieldName}` : null,
    property.legalCheckStatus ? `Legal ${property.legalCheckStatus}` : null,
    property.visitsRemaining != null ? `${property.visitsRemaining} visits left` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/crm/property-listings/${property.id}`}
      className={cn("crm-kanban-card group !mt-0 !p-3 flex items-center gap-2 no-underline")}
      style={{ ["--crm-stage-accent" as string]: "#059669" }}
    >
      <div className="crm-kanban-avatar crm-kanban-avatar--sm shrink-0" aria-hidden>
        <ClipboardList size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="crm-kanban-card-title truncate text-sm">{property.title || "PM property"}</p>
        <p className="crm-kanban-card-subtitle truncate">{subtitle || property.assignmentStatus || "—"}</p>
      </div>
      {property.pmStage ? (
        <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          {property.pmStage}
        </span>
      ) : null}
    </Link>
  );
}
