"use client";

import { useEffect, useState } from "react";
import { Loader2, History, ArrowUpCircle, AlertOctagon } from "lucide-react";
import { CrmSectionCard, CrmStatusBadge } from "@/components/crm/ui";
import { fetchActivePropertyPlan } from "../../lib/subscriptions/backend-api";
import type { ActivePropertyPlan } from "../../lib/subscriptions/types";
import PropertyPlanHistoryModal from "./PropertyPlanHistoryModal";
import UpgradePlanModal from "../subscriptions/UpgradePlanModal";
import CancelPlanModal from "../subscriptions/CancelPlanModal";

export default function ActivePropertyPlanCard({
  propertyId,
  leadId,
}: {
  propertyId: string;
  leadId?: string;
}) {
  const [plan, setPlan] = useState<ActivePropertyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const loadPlan = () => {
    if (!propertyId) return;
    setLoading(true);
    fetchActivePropertyPlan(propertyId)
      .then((data) => setPlan(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPlan();
  }, [propertyId]);

  const headerActions = (
    <div className="flex items-center gap-2">
      {plan?.status === "ACTIVE" && (
        <>
          <button
            onClick={() => setUpgradeOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-700"
          >
            <ArrowUpCircle size={13} />
            Upgrade
          </button>
          <button
            onClick={() => setCancelOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-red-500/10 border border-red-500/30 px-2.5 text-xs font-medium text-red-400 hover:bg-red-500/20"
          >
            <AlertOctagon size={13} />
            Cancel
          </button>
        </>
      )}
      <button
        onClick={() => setHistoryOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white shadow-xs transition-colors hover:bg-emerald-700 focus-visible:outline-none"
      >
        <History size={14} />
        View History
      </button>
    </div>
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
      {upgradeOpen && (
        <UpgradePlanModal
          isOpen={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          leadId={leadId || ""}
          userPropertyId={plan?.userPropertyId || propertyId}
          currentPlanName={plan?.planName}
          onSuccess={loadPlan}
        />
      )}
      {cancelOpen && (
        <CancelPlanModal
          isOpen={cancelOpen}
          onClose={() => setCancelOpen(false)}
          leadId={leadId || ""}
          userPropertyId={plan?.userPropertyId || propertyId}
          planName={plan?.planName}
          onSuccess={loadPlan}
        />
      )}
    </>
  );
}
