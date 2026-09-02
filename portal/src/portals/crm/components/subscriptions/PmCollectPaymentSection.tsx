"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CrmButton, CrmLabel, CrmSelect } from "@/components/crm/ui";
import {
  createPmOrder,
  fetchPMPlans,
  verifyPmPayment,
} from "@/lib/crm/subscriptions/backend-api";
import type { PMPlanCatalogItem } from "@/lib/crm/subscriptions/types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay script failed"));
    document.body.appendChild(script);
  });
}

type Props = {
  leadId: string;
  onPaid?: () => void;
};

/** Process-flow step: collect PM subscription payment before property bind. */
export default function PmCollectPaymentSection({ leadId, onPaid }: Props) {
  const [plans, setPlans] = useState<PMPlanCatalogItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [planId, setPlanId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlans(true);
    fetchPMPlans()
      .then((rows) => {
        if (cancelled) return;
        setPlans(rows);
        if (rows[0]) {
          setPlanId(String(rows[0].planId));
          if (rows[0].variants?.[0]) setVariantId(String(rows[0].variants[0].id));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlans(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((p) => String(p.planId) === planId),
    [plans, planId],
  );

  const selectedVariant = useMemo(
    () => selectedPlan?.variants?.find((v) => String(v.id) === variantId),
    [selectedPlan, variantId],
  );

  const startPayment = async () => {
    if (!leadId || !planId || !variantId) {
      toast.error("Select a PM plan first");
      return;
    }
    setPaying(true);
    try {
      const order = await createPmOrder({
        leadId,
        planId: Number(planId),
        planVariantId: Number(variantId),
        billingCycle: selectedVariant?.billingCycle,
      });
      if (!order) throw new Error("Could not create payment order");

      const razorpayOrderId = order.razorpayOrderId || order.orderId;
      const keyId = order.keyId;
      if (!keyId || !razorpayOrderId) {
        toast.success("Order created — complete payment in 2bigha admin if checkout is unavailable");
        onPaid?.();
        return;
      }

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error("Razorpay checkout unavailable");

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: keyId,
          amount: order.amount,
          currency: order.currency || "INR",
          order_id: razorpayOrderId,
          name: "2bigha Property Management",
          description: selectedPlan?.planName || "PM subscription",
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verified = await verifyPmPayment({
                leadId,
                planId: Number(planId),
                billingCycle: selectedVariant?.billingCycle,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              if (verified?.success) {
                toast.success("Payment verified — subscription credit available");
                onPaid?.();
                resolve();
              } else {
                reject(new Error(verified?.message || "Payment verification failed"));
              }
            } catch (err) {
              reject(err);
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled")),
          },
        });
        rzp.open();
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  if (loadingPlans) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading PM plans…
      </div>
    );
  }

  if (plans.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
        <CreditCard size={14} />
        Collect PM subscription payment
      </div>
      <p className="text-[11px] text-amber-800">
        No unbound subscription credit on this lead. Collect payment here, then create the PM property to bind it.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <CrmLabel>Plan</CrmLabel>
          <CrmSelect
            value={planId}
            onChange={(e) => {
              const next = e.target.value;
              setPlanId(next);
              const plan = plans.find((p) => String(p.planId) === next);
              setVariantId(plan?.variants?.[0] ? String(plan.variants[0].id) : "");
            }}
            className="mt-1"
          >
            {plans.map((p) => (
              <option key={p.planId} value={String(p.planId)}>
                {p.planName}
              </option>
            ))}
          </CrmSelect>
        </div>
        <div>
          <CrmLabel>Variant</CrmLabel>
          <CrmSelect
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="mt-1"
          >
            {(selectedPlan?.variants || []).map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.billingCycle} · {(v.visitsPerCycle ?? v.visitsAllowed ?? 0)} visits · ₹
                {v.price.toLocaleString("en-IN")}
              </option>
            ))}
          </CrmSelect>
        </div>
      </div>
      <CrmButton
        type="button"
        disabled={paying || !variantId}
        onClick={() => void startPayment()}
        className="gap-2 bg-amber-700 hover:bg-amber-800"
      >
        {paying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
        {paying ? "Opening checkout…" : "Pay with Razorpay"}
      </CrmButton>
    </div>
  );
}
