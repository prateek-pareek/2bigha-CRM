"use client";

import { CreditCard } from "lucide-react";
import { CrmStatusBadge } from "@/components/crm/ui";
import type { PmPaymentRecord } from "@/lib/crm/subscriptions/types";

function paymentTone(status: string): "neutral" | "success" | "warning" | "info" {
  const s = status.toUpperCase();
  if (s === "SUCCESS") return "success";
  if (s === "INITIATED" || s === "PROCESSING" || s === "PENDING") return "warning";
  if (s === "FAILED" || s === "REFUNDED") return "neutral";
  return "info";
}

export default function PmPaymentHistorySection({
  payments,
  compact,
}: {
  payments: PmPaymentRecord[];
  compact?: boolean;
}) {
  if (payments.length === 0) {
    return (
      <p className="text-xs italic text-text-muted">No PM payment records found for this lead.</p>
    );
  }

  return (
    <div className="space-y-2">
      {!compact ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-text-main">
          <CreditCard size={14} />
          Payment history
        </div>
      ) : null}
      {payments.map((p) => (
        <div
          key={p.id}
          className="rounded-md border border-border bg-surface-dim px-3 py-2.5 text-xs space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-text-main">{p.planName || "PM plan"}</span>
            <CrmStatusBadge tone={paymentTone(p.status)}>{p.status}</CrmStatusBadge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-text-muted">
            {p.billingCycle ? <span>{p.billingCycle}</span> : null}
            {p.totalAmount != null ? (
              <span className="font-medium text-text-main">₹{p.totalAmount.toLocaleString("en-IN")}</span>
            ) : null}
            {p.completedAt ? (
              <span>Paid {new Date(p.completedAt).toLocaleString()}</span>
            ) : p.initiatedAt ? (
              <span>Started {new Date(p.initiatedAt).toLocaleString()}</span>
            ) : null}
          </div>
          {p.propertyTitle ? (
            <p className="text-[11px] text-emerald-700">Bound: {p.propertyTitle}</p>
          ) : null}
          {p.razorpayOrderId ? (
            <p className="font-mono text-[10px] text-text-muted truncate">{p.razorpayOrderId}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
