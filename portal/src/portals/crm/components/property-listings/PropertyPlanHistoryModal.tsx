"use client";

import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchPropertyPlanHistory } from "../../lib/subscriptions/backend-api";
import type { ActivePropertyPlan } from "../../lib/subscriptions/types";
import { CrmStatusBadge } from "@/components/crm/ui";

interface PropertyPlanHistoryModalProps {
  propertyId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PropertyPlanHistoryModal({ propertyId, isOpen, onClose }: PropertyPlanHistoryModalProps) {
  const [history, setHistory] = useState<ActivePropertyPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !propertyId) return;
    let cancelled = false;
    setLoading(true);
    fetchPropertyPlanHistory(propertyId)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, propertyId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="theme-crm-hubspot max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--text-main)]">
            <History size={18} className="text-[var(--text-muted)]" />
            <span>Property Plan History</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4 min-h-[200px]">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm italic text-[var(--text-muted)]">
              No historical plans found for this property.
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((plan, index) => {
                let badgeTone: "neutral" | "success" | "warning" | "info" = "neutral";
                if (plan.status === "ACTIVE") badgeTone = "success";
                else if (plan.status === "EXPIRING") badgeTone = "warning";
                else if (plan.status === "EXPIRED" || plan.status === "CANCELLED" || plan.status === "SUSPENDED") badgeTone = "neutral";

                return (
                  <div key={plan.orderId || index} className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-4 text-sm shadow-sm transition-all hover:shadow-md">
                    <div className="mb-3 flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                      <div className="font-semibold text-base text-[var(--text-main)]">{plan.planName}</div>
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
                        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Visits Used / Remaining</span>
                        <span className="font-medium text-[var(--text-main)]">
                          {plan.visitsUsed ?? 0} / {plan.visitsRemaining ?? "—"}
                        </span>
                      </div>
                      {plan.orderId && (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Order ID</span>
                          <span className="font-mono text-xs font-medium text-[var(--text-muted)]">
                            {plan.orderId}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
