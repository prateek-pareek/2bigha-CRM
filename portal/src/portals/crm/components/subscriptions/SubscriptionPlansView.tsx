"use client";

import React, { useEffect, useState } from "react";
import { Check, Loader2, Crown, Building2, ChevronRight } from "lucide-react";
import { fetchSubscriptionPlans, fetchPMPlans } from "../../lib/subscriptions/backend-api";
import type { SubscriptionPlan, PMPlanCatalogItem } from "../../lib/subscriptions/types";
import OrderDiagnosticTool from "./OrderDiagnosticTool";
import PlanPurchaseModal from "./PlanPurchaseModal";

export default function SubscriptionPlansView() {
  const [activeCatalog, setActiveCatalog] = useState<"marketplace" | "pm">("marketplace");
  const [marketplacePlans, setMarketplacePlans] = useState<SubscriptionPlan[]>([]);
  const [pmPlans, setPmPlans] = useState<PMPlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<string>("1M");

  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [selectedPlanDetails, setSelectedPlanDetails] = useState<{
    name: string;
    id: number;
    variantId?: number;
    billingCycle: string;
    price: number;
    originalPrice?: number;
    isPm?: boolean;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [mPlans, pPlans] = await Promise.all([
          fetchSubscriptionPlans(),
          fetchPMPlans(),
        ]);
        const sortedM = (mPlans || []).sort((a, b) => a.tier - b.tier);
        setMarketplacePlans(sortedM);
        setPmPlans(pPlans || []);
      } catch (err) {
        console.error("Failed to load subscription catalog:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-xs">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  const availableCycles = Array.from(
    new Set(marketplacePlans.flatMap((p) => p.pricing.map((pr) => pr.billingCycle)))
  ).sort((a, b) => {
    const monthsA = parseInt(a.replace("M", ""), 10) || 0;
    const monthsB = parseInt(b.replace("M", ""), 10) || 0;
    return monthsA - monthsB;
  });

  const getCycleLabel = (cycle: string) => {
    if (cycle === "1M") return "Monthly";
    if (cycle === "3M") return "Quarterly";
    if (cycle === "6M") return "Half-Yearly";
    if (cycle === "12M") return "Yearly";
    return cycle;
  };

  const handleOpenUpgradeModal = (
    name: string,
    id: number,
    price: number,
    billingCycleLabel: string,
    variantId?: number,
    originalPrice?: number,
    isPm?: boolean
  ) => {
    setSelectedPlanDetails({
      name,
      id,
      variantId,
      billingCycle: billingCycleLabel,
      price,
      originalPrice,
      isPm,
    });
    setPurchaseModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
            Subscription & Service Plans
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Choose seller marketplace plans or Property Management (PM) packages for your real estate operations.
          </p>
        </div>

        {/* Catalog Switcher Segmented Control */}
        <div className="inline-flex items-center rounded-lg bg-[var(--surface-dim)] p-1 border border-[var(--border-color)] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveCatalog("marketplace")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeCatalog === "marketplace"
                ? "bg-[var(--card-bg)] text-[var(--text-main)] shadow-xs border border-[var(--border-color)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <Crown size={14} className="text-amber-500" />
            Marketplace Tiers
          </button>
          <button
            type="button"
            onClick={() => setActiveCatalog("pm")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeCatalog === "pm"
                ? "bg-[var(--card-bg)] text-[var(--text-main)] shadow-xs border border-[var(--border-color)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <Building2 size={14} className="text-emerald-500" />
            PM Service Plans
          </button>
        </div>
      </div>

      {/* Billing Cycle Switcher for Marketplace Catalog */}
      {activeCatalog === "marketplace" && availableCycles.length > 0 && (
        <div className="flex justify-center">
          <div className="inline-flex items-center space-x-1 rounded-full border border-[var(--border-color)] bg-[var(--surface-dim)] p-1">
            {availableCycles.map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`flex items-center rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  billingCycle === cycle
                    ? "bg-[var(--card-bg)] text-[var(--text-main)] shadow-xs border border-[var(--border-color)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                {getCycleLabel(cycle)}
                {cycle === "12M" && (
                  <span className="ml-1.5 text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                    Save 20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Payment Diagnostic Tool */}
      <OrderDiagnosticTool />

      {/* Catalog Cards Grid */}
      {activeCatalog === "marketplace" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {marketplacePlans.map((plan) => {
            const pricingOption =
              plan.pricing.find((p) => p.billingCycle === billingCycle) || plan.pricing[0];

            if (!pricingOption) return null;

            const isPopular = plan.isPopular;
            const isCurrent = pricingOption.isCurrentPlan;
            const allFeatures = [...plan.features, ...pricingOption.features].sort(
              (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
            );

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-xl bg-[var(--card-bg)] p-5 border transition-all duration-200 ${
                  isPopular
                    ? "border-[var(--primary)] shadow-sm ring-1 ring-[var(--primary)]/30"
                    : "border-[var(--border-color)] shadow-xs hover:border-[var(--border-color-hover)]"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-0 right-0 flex justify-center">
                    <span className="rounded-full bg-[var(--primary)] px-3 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase shadow-xs">
                      Most Popular
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-main)]">{plan.name}</h3>
                      {plan.displayLabel && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{plan.displayLabel}</p>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-500/20">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Price Header */}
                  <div className="mb-1 flex items-baseline text-[var(--text-main)]">
                    <span className="text-2xl font-bold tracking-tight">
                      ₹{pricingOption.basePrice.toLocaleString("en-IN")}
                    </span>
                    <span className="ml-1 text-xs text-[var(--text-muted)] font-medium">
                      /{pricingOption.billingCycle === "12M" ? "yr" : pricingOption.billingCycle === "3M" ? "qtr" : "mo"}
                    </span>
                  </div>

                  <div className="h-5 mb-4">
                    {pricingOption.originalPrice &&
                      pricingOption.originalPrice > pricingOption.basePrice && (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                          <span className="line-through">
                            ₹{pricingOption.originalPrice.toLocaleString("en-IN")}
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded">
                            Save ₹{(pricingOption.originalPrice - pricingOption.basePrice).toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}
                  </div>

                  {/* Feature Checklist */}
                  <div className="pt-3 border-t border-[var(--border-color)] mb-5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
                      Included Capabilities ({allFeatures.length})
                    </div>
                    <ul className="space-y-2">
                      {allFeatures.map((feature) => (
                        <li key={feature.id} className="flex items-start gap-2">
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                          <span className="text-xs text-[var(--text-main)] font-medium">
                            {feature.displayText || feature.featureValue}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  type="button"
                  onClick={() =>
                    handleOpenUpgradeModal(
                      plan.name,
                      plan.id,
                      pricingOption.basePrice,
                      pricingOption.billingCycle,
                      undefined,
                      pricingOption.originalPrice,
                      false
                    )
                  }
                  disabled={isCurrent || pricingOption.isDisabled}
                  className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs ${
                    isCurrent
                      ? "bg-[var(--surface-dim)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border-color)]"
                      : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
                  }`}
                >
                  {isCurrent ? "Current Active Plan" : "Upgrade Plan"}
                  {!isCurrent && <ChevronRight size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* PM Plans Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pmPlans.map((pmPlan) => {
            const firstVariant = pmPlan.variants[0];
            return (
              <div
                key={pmPlan.planId}
                className="flex flex-col justify-between rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] p-5 shadow-xs transition-all hover:border-[var(--border-color-hover)]"
              >
                <div>
                  <div className="mb-3">
                    <span className="inline-block bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase mb-1.5">
                      PM Service Package
                    </span>
                    <h3 className="text-base font-bold text-[var(--text-main)]">{pmPlan.planName}</h3>
                    {pmPlan.description && (
                      <p className="text-xs text-[var(--text-muted)] mt-1">{pmPlan.description}</p>
                    )}
                  </div>

                  <div className="mb-4 flex items-baseline text-[var(--text-main)]">
                    <span className="text-2xl font-bold tracking-tight">
                      ₹{pmPlan.basePrice.toLocaleString("en-IN")}
                    </span>
                    <span className="ml-1 text-xs text-[var(--text-muted)]">/starting base</span>
                  </div>

                  {/* Variants */}
                  <div className="pt-3 border-t border-[var(--border-color)] mb-5 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                      Available Billing Variants ({pmPlan.variants.length})
                    </div>
                    {pmPlan.variants.map((variant) => (
                      <div
                        key={variant.id}
                        className="p-2.5 bg-[var(--surface-dim)] border border-[var(--border-color)] rounded-lg flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-[var(--text-main)]">{variant.billingCycle}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {variant.visitsPerCycle} Visits / Cycle
                          </div>
                        </div>
                        <div className="font-bold text-[var(--primary)]">
                          ₹{variant.price.toLocaleString("en-IN")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleOpenUpgradeModal(
                      pmPlan.planName,
                      pmPlan.planId,
                      firstVariant?.price || pmPlan.basePrice,
                      firstVariant?.billingCycle || "YEARLY",
                      firstVariant?.id,
                      undefined,
                      true
                    )
                  }
                  className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  Select PM Plan <ChevronRight size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Plan Purchase Modal */}
      {selectedPlanDetails && (
        <PlanPurchaseModal
          isOpen={purchaseModalOpen}
          onClose={() => setPurchaseModalOpen(false)}
          planName={selectedPlanDetails.name}
          planId={selectedPlanDetails.id}
          planVariantId={selectedPlanDetails.variantId}
          billingCycle={selectedPlanDetails.billingCycle}
          price={selectedPlanDetails.price}
          originalPrice={selectedPlanDetails.originalPrice}
          isPmPlan={selectedPlanDetails.isPm}
        />
      )}
    </div>
  );
}
