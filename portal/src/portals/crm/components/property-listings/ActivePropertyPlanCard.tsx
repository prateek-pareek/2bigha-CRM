"use client";

import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { CrmSectionCard, CrmStatusBadge } from "@/components/crm/ui";
import { fetchActivePropertyPlan } from "../../lib/subscriptions/backend-api";
import type { ActivePropertyPlan } from "../../lib/subscriptions/types";
import PropertyPlanHistoryModal from "./PropertyPlanHistoryModal";

export default function ActivePropertyPlanCard({ propertyId }: { propertyId: string }) {
  const [plan, setPlan] = useState<ActivePropertyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    setLoading(true);
    fetchActivePropertyPlan(propertyId)
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const headerActions = (
    <button
      onClick={() => setHistoryOpen(true)}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-600"
    >
      <History size={14} />
      View History
    </button>
  );

  if (loading) {
    return (
      <CrmSectionCard title="Active PM Subscription">
        <div className="flex h-20 items-center justify-center text-xs text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
        </div>
      </CrmSectionCard>
    );
  }

  if (!plan) {
    return (
      <>
        <CrmSectionCard title="Active PM Subscription" actions={headerActions}>
          <div className="flex h-20 items-center justify-center">
            <p className="text-xs italic text-[var(--text-muted)]">No active plan bound to this property.</p>
          </div>
        </CrmSectionCard>
        {historyOpen && (
          <PropertyPlanHistoryModal 
            propertyId={propertyId} 
            isOpen={historyOpen} 
            onClose={() => setHistoryOpen(false)} 
          />
        )}
      </>
    );
  }

  let badgeTone: "neutral" | "success" | "warning" | "info" = "neutral";
  if (plan.status === "ACTIVE") badgeTone = "success";
  else if (plan.status === "EXPIRING") badgeTone = "warning";
  else if (plan.status === "EXPIRED" || plan.status === "CANCELLED" || plan.status === "SUSPENDED") badgeTone = "neutral";

  return (
    <>
      <CrmSectionCard title="Active PM Subscription" actions={headerActions}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2.5">
            <span className="font-semibold text-[var(--text-main)] text-base">{plan.planName}</span>
            <CrmStatusBadge tone={badgeTone}>{plan.status}</CrmStatusBadge>
          </div>

          <div className="grid grid-cols-2 gap-y-3 gap-x-4">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Billing Cycle</span>
              <span className="font-medium text-[var(--text-main)]">{plan.billingCycle}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Price</span>
              <span className="font-medium text-[var(--text-main)]">₹{plan.price.toLocaleString("en-IN")}</span>
            </div>

            <div className="flex flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Start Date</span>
              <span className="font-medium text-[var(--text-main)]">
                {plan.startDate ? new Date(plan.startDate).toLocaleDateString() : "—"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">End Date</span>
              <span className="font-medium text-[var(--text-main)]">
                {plan.endDate ? new Date(plan.endDate).toLocaleDateString() : "—"}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Visits Used</span>
              <span className="font-medium text-[var(--text-main)]">
                {plan.visitsUsed ?? 0}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Visits Remaining</span>
              <span className="font-medium text-[var(--text-main)]">
                {plan.visitsRemaining ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </CrmSectionCard>
      {historyOpen && (
        <PropertyPlanHistoryModal 
          propertyId={propertyId} 
          isOpen={historyOpen} 
          onClose={() => setHistoryOpen(false)} 
        />
      )}
    </>
  );
}
