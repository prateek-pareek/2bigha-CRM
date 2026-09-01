"use client";

import React, { useEffect, useState } from "react";
import { Check, Loader2, Plus, Sparkles, AlertCircle } from "lucide-react";
import { CrmSectionCard } from "@/components/crm/ui";
import { fetchSubscriptionPlans } from "../../lib/subscriptions/backend-api";
import type { SubscriptionPlan } from "../../lib/subscriptions/types";
import OrderDiagnosticTool from "./OrderDiagnosticTool";
import { CrmButton } from "../ui/CrmButton";

export default function SubscriptionPlansView() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  useEffect(() => {
    async function loadPlans() {
      try {
        const data = await fetchSubscriptionPlans();
        // Sort plans by tier ascending
        const sorted = (data || []).sort((a, b) => a.tier - b.tier);
        setPlans(sorted);
      } finally {
        setLoading(false);
      }
    }
    loadPlans();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-sm">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--surface-dim)] text-[var(--text-muted)]">
        <p className="text-sm">No subscription plans available at the moment.</p>
      </div>
    );
  }

  // Find if yearly is available across any plan
  const hasYearly = plans.some((p) => p.pricing.some((pr) => pr.billingCycle === "YEARLY"));

  return (
    <div className="space-y-6 pb-12">
      <div className="text-center mt-2">
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">Simple, transparent pricing</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl mx-auto">
          Scale your real estate operations with features tailored to your needs. Upgrade anytime as your team grows.
        </p>
      </div>

      {hasYearly && (
        <div className="flex justify-center mt-4">
          <div className="flex items-center space-x-1 rounded-full border border-[var(--border-color)] bg-[var(--surface-dim)] p-1 shadow-sm">
            <button
              onClick={() => setBillingCycle("MONTHLY")}
              className={`rounded-full px-5 py-1.5 text-xs font-semibold transition-colors ${
                billingCycle === "MONTHLY" ? "bg-[var(--card-bg)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("YEARLY")}
              className={`flex items-center rounded-full px-5 py-1.5 text-xs font-semibold transition-colors ${
                billingCycle === "YEARLY" ? "bg-[var(--card-bg)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Yearly <span className="ml-1.5 text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Save 20%</span>
            </button>
          </div>
        </div>
      )}

      <OrderDiagnosticTool />

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          // Find pricing for selected cycle, fallback to first available if not found
          const pricingOption =
            plan.pricing.find((p) => p.billingCycle === billingCycle) || plan.pricing[0];

          if (!pricingOption) return null;

          const isPopular = plan.isPopular;
          const isCurrent = pricingOption.isCurrentPlan;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl bg-[var(--card-bg)] p-5 transition-all duration-300 hover:shadow-md ${
                isPopular
                  ? "border-2 border-[var(--primary)] shadow-sm scale-[1.01]"
                  : "border border-[var(--border-color)] shadow-sm hover:border-[var(--border-color-hover)] hover:-translate-y-0.5"
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-0 right-0 flex justify-center">
                  <span className="rounded-full bg-[var(--primary)] px-3 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase shadow-sm">
                    Most Popular
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute top-3 right-3">
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
                    Current Plan
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-[var(--text-main)]">{plan.name}</h3>
                {plan.displayLabel && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{plan.displayLabel}</p>
                )}
              </div>

              <div className="mb-1 flex items-baseline text-[var(--text-main)]">
                <span className="text-3xl font-extrabold tracking-tight">₹{pricingOption.basePrice}</span>
                <span className="ml-1 text-sm font-semibold text-[var(--text-muted)]">
                  /{pricingOption.billingCycle === "YEARLY" ? "yr" : "mo"}
                </span>
              </div>
              
              <div className="h-5 mb-3">
                {pricingOption.originalPrice && pricingOption.originalPrice > pricingOption.basePrice && (
                  <span className="text-xs text-[var(--text-muted)] line-through">
                    ₹{pricingOption.originalPrice}
                  </span>
                )}
              </div>

              <div className="mb-6 flex-1">
                <div className="h-px w-full bg-[var(--border-color)] mb-4"></div>
                <ul className="space-y-3">
                  {[...plan.features, ...pricingOption.features]
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                    .map((feature) => (
                      <li key={feature.id} className="flex items-start">
                        <Check className="h-4 w-4 shrink-0 text-[var(--primary)] mt-0.5" />
                        <span className="ml-2.5 text-xs text-[var(--text-main)] font-medium">
                          {feature.displayText || feature.featureValue}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>

              <CrmButton
                variant={isPopular ? "primary" : "secondary"}
                className={`w-full justify-center py-4 text-sm font-semibold ${
                  isPopular ? "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white" : ""
                }`}
                disabled={isCurrent || pricingOption.isDisabled}
              >
                {isCurrent ? "Current Plan" : "Upgrade"}
              </CrmButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
